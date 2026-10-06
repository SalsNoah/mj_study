import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { getSampleRemovalPreview, getSampleUpdatePreview } from '@/data/sampleCatalog';
import { createSampleProblems, samplesAlreadyPresent } from '@/data/samples';
import { contentFingerprint } from '@/data/sampleIdentity';
import { normalizeStore } from '@/domain/records';
import { type Attempt, type Problem, type Store } from '@/domain/types';
import { analyzeHand } from '@/domain/ukeire';
import { validateProblem } from '@/domain/validate';
import { LocalStorageRepository, type SaveResult } from './repository';

const KEY = 'catalog-test:v1';
const PREFIX = `${KEY}:sample-catalog-backup:`;
let data: Map<string, string>;
let repo: LocalStorageRepository;
function success(result: SaveResult): Store {
  expect(result.ok, !result.ok ? result.reason : '').toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.store;
}
function load() {
  const result = repo.load();
  if (!result.ok) throw new Error(result.reason);
  return result.store;
}
function legacy() {
  const { problems, tagName } = createLegacySampleProblems();
  return success(repo.addProblems(load(), problems, tagName));
}
function update(store = load(), selected = [] as string[]) {
  return success(repo.updateSampleCatalog(store, selected));
}
function backupId() {
  const result = repo.listSampleCatalogBackups();
  if (!result.ok) throw new Error(result.reason);
  return result.backups[0]!.id;
}
function attempt(problemId: string, id = 'attempt1'): Attempt {
  return { id, problemId, contentRevision: 0, sessionId: 'test-session', questionIndex: 0,
    at: '2026-10-05T10:00:00.000Z', result: 'correct', selectedTile: '4s' };
}
function custom(partial: Partial<Problem> = {}): Problem {
  const problem = createLegacySampleProblems().problems[0]!;
  return { ...problem, title: '自作問題', ...partial };
}

beforeEach(() => {
  data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    key: vi.fn((index: number) => [...data.keys()][index] ?? null),
    get length() { return data.size; },
    removeItem: vi.fn((key: string) => { data.delete(key); }),
    clear: vi.fn(() => data.clear()),
  } as Storage);
  repo = new LocalStorageRepository(KEY);
});

describe('sample catalog data and identity', () => {
  it('ships ten valid 14-tile problems, eight answers and two memo problems', () => {
    const { problems, tagName } = createSampleProblems();
    expect(tagName).toBe('サンプル');
    expect(problems).toHaveLength(10);
    expect(problems.filter((problem) => problem.answerEnabled)).toHaveLength(8);
    expect(problems.filter((problem) => !problem.answerEnabled)).toHaveLength(2);
    for (const problem of problems) {
      expect(problem.concealed).toHaveLength(14);
      expect(problem.drawn).toBeNull();
      expect(validateProblem(problem)).toEqual([]);
      expect(problem.sample?.fingerprint).toBe(contentFingerprint(problem, [], ['サンプル']));
    }
    expect(problems[2]!.acceptedDiscards).toEqual(['4s']);
    expect(problems[2]!.explanation).toContain('同率');
    expect(problems[2]!.explanation).toContain('内側');
    expect(problems[2]!.explanation).toContain('確定');
  });

  it('keeps every pre-unification v2 discard analysis identical, including the four-copy ceiling', () => {
    const oldDrawn: Problem['concealed'] = ['4z', '4s', '9s', '7z', '1z', '5p', '0m', '8s', '8s', '9m'];
    for (const [index, current] of createSampleProblems().problems.entries()) {
      expect(current.concealed.at(-1)).toBe(oldDrawn[index]);
      const legacyHand = { ...current, concealed: current.concealed.slice(0, -1), drawn: oldDrawn[index]! };
      expect(analyzeHand(current)).toEqual(analyzeHand(legacyHand));
      expect(analyzeHand(current).status).toBe('ready');
    }
    const original = createSampleProblems().problems[0]!;
    const invalid = { ...original, concealed: ['1m', '1m', '1m', '1m', '1m'] as Problem['concealed'] };
    expect(validateProblem(invalid).some((issue) => issue.code === 'tile_over5')).toBe(true);
  });

  it('does nothing on startup and requires all catalog identities to count as installed', () => {
    const before = legacy();
    expect(samplesAlreadyPresent(before)).toBe(false);
    const raw = data.get(KEY);
    repo.dispose(); repo = new LocalStorageRepository(KEY);
    expect(load().problems).toHaveLength(2);
    expect(data.get(KEY)).toBe(raw);
    const added = update(load());
    expect(added.problems).toHaveLength(12);
    expect(samplesAlreadyPresent(added)).toBe(true);
    expect(getSampleUpdatePreview(added).additions).toBe(0);
  });

  it('only offers complete legacy matches with the sample tag meaning; it never guesses origin', () => {
    let store = legacy();
    const first = store.problems[0]!;
    store = success(repo.saveProblem(store, custom({ tagIds: first.tagIds }), true));
    store = success(repo.saveProblem(store, { ...store.problems[1]!, privateMemo: '私の編集' }, false));
    const preview = getSampleUpdatePreview(store);
    expect(preview.candidates.map((entry) => entry.id)).toEqual([first.id]);
    const result = update(store, [first.id]);
    expect(result.problems).toHaveLength(12);
    expect(result.problems.some((problem) => problem.title === '自作問題')).toBe(true);
    expect(result.problems.some((problem) => problem.privateMemo === '私の編集')).toBe(true);
    expect(repo.updateSampleCatalog(result, [first.id]).ok).toBe(false);
  });

  it('preserves unselected exact matches and semantic tag names survive import remapping', () => {
    let store = legacy();
    const unselected = store.problems[1]!;
    store = success(repo.renameTag(store, store.tags[0]!.id, ' サンプル '));
    expect(getSampleUpdatePreview(store).candidates).toHaveLength(2);
    store = update(store, [store.problems[0]!.id]);
    expect(store.problems.find((problem) => problem.id === unselected.id)).toEqual(unselected);
    const before = data.get(KEY);
    const count = data.size;
    expect(success(repo.updateSampleCatalog(store, [])).revision).toBe(store.revision);
    expect(data.size).toBe(count);
    expect(data.get(KEY)).toBe(before);
  });

  it('retains original metadata on editor saves, protects edits, and removes provenance on copies', () => {
    let store = update();
    const original = store.problems[0]!;
    const { sample: _sample, ...editorFields } = original;
    store = success(repo.saveProblem(store, { ...editorFields, title: '編集した題' }, false));
    expect(store.problems[0]!.sample).toEqual(original.sample);
    expect(getSampleUpdatePreview(store)).toMatchObject({ additions: 0, preservedEdited: 1 });
    store = success(repo.duplicateProblem(store, original.id));
    expect(store.problems.at(-1)!.sample).toBeUndefined();
    expect(getSampleUpdatePreview(store).additions).toBe(0);
  });

  it('treats malformed or unknown provenance conservatively and preserves it on import', () => {
    const malformed = custom({ title: 'サンプル：自作' });
    (malformed as unknown as Record<string, unknown>).sample = { catalogId: 'mahjong-study-samples', itemId: 'sample-v2-01' };
    let store = success(repo.saveProblem(load(), malformed, true));
    expect(getSampleUpdatePreview(store)).toEqual({ candidates: [], additions: 10, preservedEdited: 0 });
    store = update(store);
    expect(store.problems.find((problem) => problem.id === malformed.id)).toEqual(malformed);
    expect(getSampleUpdatePreview(store).additions).toBe(0);
  });

  it('preserves origin across reload, export, replace and merge; missing catalog items alone are added', () => {
    let store = update();
    const exported = repo.exportJson(store);
    repo.dispose(); repo = new LocalStorageRepository(KEY); store = load();
    store = success(repo.importJson(store, exported, 'replace'));
    expect(samplesAlreadyPresent(store)).toBe(true);
    expect(repo.listSampleCatalogBackups()).toMatchObject({ ok: true, backups: [{ state: 'applied' }] });
    store = success(repo.importJson(store, exported, 'merge'));
    expect(store.problems).toHaveLength(20);
    expect(getSampleUpdatePreview(store).additions).toBe(0);
    expect(store.problems.slice(10).map((problem) => problem.sample)).toEqual(store.problems.slice(0, 10).map((problem) => problem.sample));
    const missingItem = store.problems[0]!.sample!.itemId;
    for (const problem of store.problems.filter((entry) => entry.sample?.itemId === missingItem)) store = success(repo.deleteProblem(store, problem.id));
    expect(getSampleUpdatePreview(store).additions).toBe(1);
    expect(update(store).problems).toHaveLength(19);
  });
});

describe('catalog snapshot transactions', () => {
  it('captures the full pre-update store and can export the original after reload', () => {
    let store = legacy();
    store = success(repo.saveProblem(store, custom({ attachments: [{ id: 'image', dataUrl: 'data:image/png;base64,test', width: 1, height: 1 }] }), true));
    store = success(repo.confirmProblem(store, store.problems[0]!.id));
    store = success(repo.recordAttempt(store, attempt(store.problems[0]!.id)));
    const before = structuredClone(store);
    update(store, store.problems.slice(0, 2).map((problem) => problem.id));
    const id = backupId();
    repo.dispose(); repo = new LocalStorageRepository(KEY); load();
    const exported = repo.exportSampleCatalogSnapshot(id);
    expect(exported.ok).toBe(true);
    if (exported.ok) expect(JSON.parse(exported.text)).toEqual(before);
    expect(data.has(PREFIX + id)).toBe(true);
  });

  it('exports the saved original without adding normalization fields to older schema-one stores', () => {
    const original = legacy();
    delete original.daily;
    for (const state of original.study) {
      delete state.lastSolvedAt;
      delete state.lastCorrectAt;
    }
    data.set(KEY, JSON.stringify(original));
    repo.dispose(); repo = new LocalStorageRepository(KEY);
    const normalized = load();
    expect(normalized.daily).toEqual({});
    expect(normalized.study[0]!.lastSolvedAt).toBeNull();
    let store = update(normalized, normalized.problems.map((problem) => problem.id));
    const id = backupId();
    const exported = repo.exportSampleCatalogSnapshot(id);
    expect(exported.ok).toBe(true);
    if (exported.ok) expect(JSON.parse(exported.text)).toEqual(original);
    store = success(repo.restoreSampleCatalog(store, id));
    expect(store.study).toEqual(original.study);
  });

  it.each(['write', 'readback', 'quota'] as const)('keeps the main store unchanged if snapshot %s fails', (kind) => {
    const store = legacy();
    const before = data.get(KEY);
    let wrote = false;
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
      if (key.startsWith(PREFIX)) {
        if (kind === 'write') throw new Error('write failure');
        if (kind === 'quota') throw new DOMException('full', 'QuotaExceededError');
        wrote = true;
      }
      data.set(key, value);
    });
    vi.mocked(localStorage.getItem).mockImplementation((key) => key.startsWith(PREFIX) && wrote ? 'bad readback' : data.get(key) ?? null);
    const result = repo.updateSampleCatalog(store, store.problems.map((problem) => problem.id));
    expect(result.ok).toBe(false);
    expect(data.get(KEY)).toBe(before);
  });

  it('keeps an unapplied snapshot after main persist failure and retries with a distinct snapshot', () => {
    const store = legacy();
    const before = data.get(KEY);
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
      if (key === KEY) throw new DOMException('full', 'QuotaExceededError');
      data.set(key, value);
    });
    expect(repo.updateSampleCatalog(store, store.problems.map((problem) => problem.id))).toMatchObject({ ok: false, code: 'quota' });
    expect(data.get(KEY)).toBe(before);
    const id = backupId();
    expect(repo.listSampleCatalogBackups()).toMatchObject({ ok: true, backups: [{ state: 'unapplied' }] });
    expect(repo.restoreSampleCatalog(store, id).ok).toBe(false);
    const originalBackup = data.get(PREFIX + id);
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => { data.set(key, value); });
    update(store, store.problems.map((problem) => problem.id));
    expect(data.get(PREFIX + id)).toBe(originalBackup);
    expect([...data.keys()].filter((key) => key.startsWith(PREFIX))).toHaveLength(2);
  });

  it('rejects stale selection, stale store, corrupt backup, and a missing committed snapshot', () => {
    const store = legacy();
    const before = data.get(KEY);
    expect(repo.updateSampleCatalog(store, ['not-present']).ok).toBe(false);
    expect(data.get(KEY)).toBe(before);
    expect(repo.updateSampleCatalog({ ...store, problems: store.problems.slice(1) }, []).ok).toBe(false);
    const next = update(store);
    const id = backupId();
    data.delete(PREFIX + id);
    expect(repo.listSampleCatalogBackups()).toMatchObject({ ok: false, code: 'corrupt' });
    expect(repo.updateSampleCatalog(next, []).ok).toBe(false);
    expect(repo.restoreSampleCatalog(next, id).ok).toBe(false);
    data.set(PREFIX + id, '{');
    expect(repo.exportSampleCatalogSnapshot(id).ok).toBe(false);
  });

  it('detects valid-JSON snapshot changes and malformed receipts without changing the main store', () => {
    const store = update();
    const id = backupId();
    const before = data.get(KEY);
    const snapshot = JSON.parse(data.get(PREFIX + id)!);
    snapshot.before.settings.autoSort = false;
    data.set(PREFIX + id, JSON.stringify(snapshot));
    expect(repo.listSampleCatalogBackups()).toMatchObject({ ok: false, code: 'corrupt' });
    expect(repo.restoreSampleCatalog(store, id).ok).toBe(false);
    expect(repo.exportSampleCatalogSnapshot(id).ok).toBe(false);
    expect(repo.updateSampleCatalog(store, []).ok).toBe(false);
    expect(data.get(KEY)).toBe(before);
    data.set(KEY, JSON.stringify({ ...store, sampleCatalogUpdates: [{ id: 'invalid' }] }));
    expect(repo.listSampleCatalogBackups()).toMatchObject({ ok: false, code: 'corrupt' });
  });

  it('keeps valid provenance when importing to another browser but does not import undo authority', () => {
    const exported = repo.exportJson(update());
    vi.mocked(localStorage.clear)();
    repo.dispose(); repo = new LocalStorageRepository(KEY);
    const imported = success(repo.importJson(load(), exported, 'replace'));
    expect(imported.sampleCatalogUpdates).toBeUndefined();
    expect(samplesAlreadyPresent(imported)).toBe(true);
    expect(repo.listSampleCatalogBackups()).toEqual({ ok: true, backups: [] });
    expect(update(imported)).toEqual(imported);
  });

  it('refuses invalid proposed state or exhausted sample tag capacity before writing a backup', () => {
    let store = load();
    store = { ...store, tags: Array.from({ length: 200 }, (_, index) => ({ id: `tag${index}`, name: `tag${index}` })) };
    store = success(repo.replaceStore(store));
    const before = data.get(KEY);
    expect(repo.updateSampleCatalog(store, [])).toMatchObject({ ok: false, code: 'validation' });
    expect([...data.keys()].filter((key) => key.startsWith(PREFIX))).toHaveLength(0);
    expect(data.get(KEY)).toBe(before);
    store = { ...store, problems: [custom({ sourceUrl: 'javascript:alert(1)' })] };
    data.set(KEY, JSON.stringify(store));
    expect(repo.updateSampleCatalog(store, []).ok).toBe(false);
    expect([...data.keys()].filter((key) => key.startsWith(PREFIX))).toHaveLength(0);
  });

  it('does not overwrite another tab that changes the main store during snapshot write', () => {
    const store = legacy();
    const external = { ...store, revision: store.revision + 1, settings: { autoSort: false } };
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
      data.set(key, value);
      if (key.startsWith(PREFIX)) data.set(KEY, JSON.stringify(external));
    });
    expect(repo.updateSampleCatalog(store, [])).toMatchObject({ ok: false, code: 'conflict' });
    expect(JSON.parse(data.get(KEY)!)).toEqual(external);
  });

  it('reports list and main-read errors, and does not write through a late read failure', () => {
    const store = legacy();
    const before = data.get(KEY);
    vi.mocked(localStorage.key).mockImplementation(() => { throw new Error('denied'); });
    expect(repo.listSampleCatalogBackups()).toMatchObject({ ok: false, code: 'access' });
    expect(repo.updateSampleCatalog(store, []).ok).toBe(false);
    vi.mocked(localStorage.key).mockImplementation((index) => [...data.keys()][index] ?? null);
    let snapshotWritten = false;
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => { data.set(key, value); snapshotWritten ||= key.startsWith(PREFIX); });
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === KEY && snapshotWritten) throw new Error('read denied');
      return data.get(key) ?? null;
    });
    expect(repo.updateSampleCatalog(store, []).ok).toBe(false);
    expect(data.get(KEY)).toBe(before);
  });
});

describe('selective catalog undo', () => {
  it('restores removed problems and history, while keeping later edits, studies, other problems and daily totals', () => {
    let store = legacy();
    const oldIds = store.problems.map((problem) => problem.id);
    store = success(repo.recordAttempt(store, attempt(oldIds[0]!)));
    store = success(repo.confirmProblem(store, oldIds[1]!));
    const original = structuredClone(store);
    store = update(store, oldIds);
    const id = backupId();
    const editedId = store.problems[0]!.id;
    const learnedId = store.problems[1]!.id;
    const confirmedId = store.problems[2]!.id;
    store = success(repo.saveProblem(store, { ...store.problems[0]!, privateMemo: '更新後に編集' }, false));
    store = success(repo.recordAttempt(store, attempt(learnedId, 'new-attempt')));
    store = success(repo.confirmProblem(store, confirmedId));
    const later = custom();
    store = success(repo.saveProblem(store, later, true));
    const daily = structuredClone(store.daily);
    repo.dispose(); repo = new LocalStorageRepository(KEY); store = load();
    store = success(repo.restoreSampleCatalog(store, id));
    expect(store.problems).toHaveLength(6);
    expect(store.problems.map((problem) => problem.id)).toEqual(expect.arrayContaining([...oldIds, editedId, learnedId, confirmedId, later.id]));
    for (const problem of original.problems) expect(store.problems.find((entry) => entry.id === problem.id)).toEqual(problem);
    for (const state of normalizeStore(original).study) expect(normalizeStore(store).study.find((entry) => entry.problemId === state.problemId)).toEqual(state);
    expect(store.attempts).toEqual(expect.arrayContaining(original.attempts));
    expect(store.attempts.some((entry) => entry.id === 'new-attempt')).toBe(true);
    expect(store.daily).toEqual(daily);
    expect(repo.listSampleCatalogBackups()).toMatchObject({ ok: true, backups: [{ state: 'restored' }] });
    const raw = data.get(KEY);
    expect(success(repo.restoreSampleCatalog(store, id))).toEqual(store);
    expect(data.get(KEY)).toBe(raw);
  });

  it('keeps new samples when their tag meaning, test participation or study state changed', () => {
    let store = update();
    const id = backupId();
    store = success(repo.setInTest(store, store.problems[0]!.id, false));
    store = success(repo.updateUnderstanding(store, store.problems[1]!.id, 'uncertain'));
    store = success(repo.renameTag(store, store.tags[0]!.id, '学習中'));
    store = success(repo.restoreSampleCatalog(store, id));
    expect(store.problems).toHaveLength(10);
  });

  it('remaps conflicting tag, problem and attempt IDs instead of overwriting later work', () => {
    let store = legacy();
    const old = store.problems[0]!;
    const oldTag = store.tags[0]!;
    store = success(repo.recordAttempt(store, attempt(old.id)));
    store = update(store, [old.id]);
    const id = backupId();
    store = success(repo.renameTag(store, oldTag.id, '自作専用'));
    store = success(repo.saveProblem(store, custom({ id: old.id, tagIds: [oldTag.id] }), true));
    store = success(repo.recordAttempt(store, attempt(old.id, 'later-attempt')));
    store = success(repo.recordAttempt(store, { ...attempt(old.id), result: 'incorrect' }));
    store = success(repo.restoreSampleCatalog(store, id));
    expect(store.problems.find((problem) => problem.id === old.id)?.title).toBe('自作問題');
    const restored = store.problems.find((problem) => problem.title === old.title)!;
    expect(restored.id).not.toBe(old.id);
    expect(store.tags.find((tag) => tag.id === restored.tagIds[0])?.name).toBe('サンプル');
    expect(store.tags.find((tag) => tag.id === oldTag.id)?.name).toBe('自作専用');
    expect(store.attempts.find((entry) => entry.id === 'attempt1')?.problemId).toBe(old.id);
    expect(store.attempts.some((entry) => entry.problemId === restored.id && entry.result === 'correct')).toBe(true);
    expect(store.attempts.find((entry) => entry.id === 'later-attempt')?.problemId).toBe(old.id);
  });

  it('leaves current data and backup receipt unchanged when restore persistence fails', () => {
    let store = legacy();
    store = update(store, store.problems.map((problem) => problem.id));
    const id = backupId();
    const before = data.get(KEY);
    const backup = data.get(PREFIX + id);
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(repo.restoreSampleCatalog(store, id)).toMatchObject({ ok: false, code: 'quota' });
    expect(data.get(KEY)).toBe(before);
    expect(data.get(PREFIX + id)).toBe(backup);
    expect(repo.listSampleCatalogBackups()).toMatchObject({ ok: true, backups: [{ state: 'applied' }] });
  });
});

describe('explicit deletion of all data', () => {
  it('deletes every snapshot in its namespace, including unapplied, restored and corrupt data, and keeps unrelated keys', () => {
    let store = legacy();
    store = success(repo.saveProblem(store, custom({ attachments: [{ id: 'image', dataUrl: 'data:image/png;base64,private-image', width: 1, height: 1 }] }), true));
    store = update(store);
    const id = backupId();
    store = success(repo.restoreSampleCatalog(store, id));
    store = update(store);
    const unappliedKey = `${PREFIX}sample-backup_000000000000000000000001`;
    const corruptKey = `${PREFIX}corrupt`;
    data.set(unappliedKey, data.get(PREFIX + id)!);
    data.set(corruptKey, '{bad');
    data.set('unrelated:key', 'keep');
    data.set(`${KEY}:another-feature:backup`, 'keep');
    store = success(repo.clearAll());
    expect(store.problems).toEqual([]);
    expect(store.attempts).toEqual([]);
    expect(store.tags).toEqual([]);
    expect(store.daily).toEqual({});
    expect([...data.keys()].some((key) => key.startsWith(PREFIX))).toBe(false);
    expect([...data.values()].some((value) => value.includes('private-image'))).toBe(false);
    expect(repo.exportSampleCatalogSnapshot(id).ok).toBe(false);
    expect(data.get('unrelated:key')).toBe('keep');
    expect(data.get(`${KEY}:another-feature:backup`)).toBe('keep');
    expect(repo.listSampleCatalogBackups()).toEqual({ ok: true, backups: [] });
  });

  it.each(['list', 'read', 'remove', 'remove-noop', 'main-save'] as const)('does not claim success on %s failure and preserves data', (kind) => {
    update(legacy());
    const before = new Map(data);
    if (kind === 'list') vi.mocked(localStorage.key).mockImplementation(() => { throw new Error('list denied'); });
    if (kind === 'read') vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key.startsWith(PREFIX)) throw new Error('read denied');
      return data.get(key) ?? null;
    });
    if (kind === 'remove') vi.mocked(localStorage.removeItem).mockImplementation(() => { throw new Error('remove denied'); });
    if (kind === 'remove-noop') vi.mocked(localStorage.removeItem).mockImplementation(() => {});
    if (kind === 'main-save') vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
      if (key === KEY) throw new DOMException('full', 'QuotaExceededError');
      data.set(key, value);
    });
    expect(repo.clearAll().ok).toBe(false);
    expect(data).toEqual(before);
  });

  it('rolls back earlier snapshot removals after a later removal fails', () => {
    let store = update(legacy());
    store = success(repo.deleteProblem(store, store.problems.at(-1)!.id));
    update(store);
    const before = new Map(data);
    let calls = 0;
    vi.mocked(localStorage.removeItem).mockImplementation((key) => {
      if (++calls === 2) throw new Error('second remove failure');
      data.delete(key);
    });
    expect(repo.clearAll()).toMatchObject({ ok: false, code: 'access' });
    expect(data).toEqual(before);
  });

  it('does not claim success if deletion readback fails and restores the removed snapshot', () => {
    update(legacy());
    const before = new Map(data);
    let failReadback = false;
    vi.mocked(localStorage.removeItem).mockImplementation((key) => { data.delete(key); failReadback = true; });
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (failReadback && key.startsWith(PREFIX)) { failReadback = false; throw new Error('readback denied'); }
      return data.get(key) ?? null;
    });
    expect(repo.clearAll()).toMatchObject({ ok: false, code: 'access' });
    expect(data).toEqual(before);
  });

  it('reports partial snapshot deletion if recovery itself fails, while retaining the main data', () => {
    let store = update(legacy());
    store = success(repo.deleteProblem(store, store.problems.at(-1)!.id));
    update(store);
    const main = data.get(KEY);
    let calls = 0;
    vi.mocked(localStorage.removeItem).mockImplementation((key) => {
      if (++calls === 2) throw new Error('second remove failure');
      data.delete(key);
    });
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('restore denied'); });
    const result = repo.clearAll();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('一部の更新前バックアップを元に戻せませんでした');
    expect(data.get(KEY)).toBe(main);
  });

  it('detects another tab update during deletion and restores removed snapshots', () => {
    const store = update(legacy());
    const keys = [...data.keys()].filter((key) => key.startsWith(PREFIX));
    const external = JSON.stringify({ ...store, revision: store.revision + 1, settings: { autoSort: false } });
    vi.mocked(localStorage.removeItem).mockImplementation((key) => {
      data.delete(key);
      data.set(KEY, external);
    });
    expect(repo.clearAll()).toMatchObject({ ok: false, code: 'conflict' });
    expect(data.get(KEY)).toBe(external);
    expect(keys.every((key) => data.has(key))).toBe(true);
  });

  it('supports explicitly clearing an initially corrupt store and its invalid snapshots', () => {
    data.set(KEY, '{corrupt');
    data.set(`${PREFIX}bad`, 'private backup');
    expect(repo.load().ok).toBe(false);
    expect(success(repo.clearAll()).problems).toEqual([]);
    expect([...data.keys()].some((key) => key.startsWith(PREFIX))).toBe(false);
  });
});


describe('safe bulk removal of current samples', () => {
  const remove = (store: Store) => success(repo.removeSampleCatalog(store, getSampleRemovalPreview(store).candidates.map(({ id }) => id)));
  const lastBackup = (store: Store) => store.sampleCatalogUpdates!.at(-1)!.id;

  it('keeps an empty catalog unchanged and adds only missing originals after repeated removal/addition', () => {
    let store = load();
    expect(remove(store)).toEqual(store);
    expect(data.size).toBe(0);
    store = update(store);
    const firstIds = store.problems.map(({ id }) => id);
    store = remove(store);
    expect(store.problems).toHaveLength(0);
    expect(store.study.map(({ problemId }) => problemId)).toEqual(firstIds);
    const raw = data.get(KEY);
    const count = data.size;
    expect(remove(store)).toEqual(store);
    expect(data.get(KEY)).toBe(raw);
    expect(data.size).toBe(count);
    store = update(store);
    expect(store.problems).toHaveLength(10);
    expect(new Set(store.problems.map((problem) => problem.sample!.itemId)).size).toBe(10);
    const again = data.get(KEY);
    expect(update(store)).toEqual(store);
    expect(data.get(KEY)).toBe(again);
    store = remove(store);
    store = update(store);
    expect(store.problems).toHaveLength(10);
    expect(store.problems.filter((problem) => problem.answerEnabled)).toHaveLength(8);
  });

  it('protects edited samples, metadata-free duplicates, tag/title-only custom data, legacy matches and unknown provenance', () => {
    let store = update(legacy());
    const original = store.problems[2]!;
    store = success(repo.saveProblem(store, { ...original, privateMemo: '保存する追記' }, false));
    store = success(repo.duplicateProblem(store, store.problems[3]!.id));
    store = success(repo.saveProblem(store, custom({ title: 'サンプル問題', tagIds: original.tagIds }), true));
    const unknown = { ...store.problems[3]!, id: 'unknown-sample', sample: { ...store.problems[3]!.sample!, version: 'unrecognized' } };
    store = success(repo.saveProblem(store, unknown, true));
    const protectedProblems = store.problems.filter((problem) => !getSampleRemovalPreview(store).candidates.some(({ id }) => id === problem.id));
    expect(getSampleRemovalPreview(store).candidates).toHaveLength(9);
    store = remove(store);
    expect(store.problems).toEqual(protectedProblems);
    store = update(store);
    expect(store.problems).toHaveLength(protectedProblems.length + 9);
    expect(store.problems.find(({ id }) => id === original.id)?.privateMemo).toBe('保存する追記');
    expect(getSampleUpdatePreview(store).additions).toBe(0);
  });

  it('retains all study, attempts, daily totals, tags and material records through deletion, reload, export and restoration', () => {
    let store = update();
    store = success(repo.recordAttempt(store, attempt(store.problems[0]!.id)));
    store = success(repo.confirmProblem(store, store.problems[1]!.id));
    store = success(repo.saveMaterial(store, { id: 'material-keep', title: '教材', url: 'https://example.com/study',
      comment: '', createdAt: '2026-10-05T10:00:00.000Z', updatedAt: '2026-10-05T10:00:00.000Z' }));
    store = success(repo.recordMaterialStudy(store, 'material-keep', '検討済み', 'material-study-keep'));
    const before = structuredClone(store);
    store = remove(store);
    const id = lastBackup(store);
    expect(store.problems).toEqual([]);
    for (const field of ['study', 'attempts', 'daily', 'tags', 'materials', 'materialStudyEvents'] as const) expect(store[field]).toEqual(before[field]);
    const snapshot = JSON.parse(data.get(PREFIX + id)!);
    expect(snapshot.before).toEqual(before);
    expect(snapshot.addedProblems).toEqual([]);
    expect(snapshot.addedStudy).toEqual([]);
    const exported = repo.exportSampleCatalogSnapshot(id);
    expect(exported.ok).toBe(true);
    if (exported.ok) expect(JSON.parse(exported.text)).toEqual(before);
    repo.dispose(); repo = new LocalStorageRepository(KEY); store = load();
    expect(store.study).toEqual(before.study);
    expect(store.attempts).toEqual(before.attempts);
    store = success(repo.importJson(store, repo.exportJson(store), 'replace'));
    expect(store.attempts).toEqual(before.attempts);
    store = success(repo.restoreSampleCatalog(store, id));
    expect(store.problems).toEqual(before.problems);
    expect(store.study).toEqual(before.study);
    expect(store.attempts).toEqual(before.attempts);
    expect(store.daily).toEqual(before.daily);
  });

  it('restores deletion after later custom edits and learning without reverting or duplicating history', () => {
    let store = update();
    const own = custom();
    store = success(repo.saveProblem(store, own, true));
    store = success(repo.recordAttempt(store, attempt(store.problems[0]!.id)));
    const originalSamples = store.problems.filter((problem) => problem.id !== own.id);
    store = remove(store);
    const id = lastBackup(store);
    store = success(repo.saveProblem(store, { ...own, privateMemo: '削除後の編集' }, false));
    store = success(repo.recordAttempt(store, attempt(own.id, 'custom-attempt')));
    const later = structuredClone(store);
    store = success(repo.restoreSampleCatalog(store, id));
    expect(store.problems.find((problem) => problem.id === own.id)).toEqual(later.problems[0]);
    expect(store.problems).toEqual(expect.arrayContaining(originalSamples));
    expect(store.study).toEqual(later.study);
    expect(store.attempts).toEqual(later.attempts);
    expect(store.daily).toEqual(later.daily);
    const raw = data.get(KEY);
    expect(success(repo.restoreSampleCatalog(store, id))).toEqual(store);
    expect(data.get(KEY)).toBe(raw);
  });

  it('restores original cards after re-addition without keeping untouched duplicates', () => {
    let store = update();
    store = success(repo.recordAttempt(store, attempt(store.problems[0]!.id)));
    const before = structuredClone(store);
    store = remove(store);
    const id = lastBackup(store);
    store = update(store);
    const laterIds = store.problems.map(({ id }) => id);
    const result = repo.restoreSampleCatalog(store, id);
    store = success(result);
    expect(result).toMatchObject({ ok: true, preservedCopies: 0 });
    expect(store.problems).toEqual(before.problems);
    expect(store.study).toEqual(before.study);
    expect(store.attempts).toEqual(before.attempts);
    expect(store.problems.some(({ id: problemId }) => laterIds.includes(problemId))).toBe(false);
    expect(update(store).problems).toEqual(before.problems);
  });

  it('keeps and counts later edited, learned, confirmed and test-customized copies during restore', () => {
    let store = update();
    const originals = structuredClone(store.problems);
    store = remove(store);
    const id = lastBackup(store);
    store = update(store);
    const later = store.problems.slice(0, 4);
    store = success(repo.saveProblem(store, { ...later[0]!, privateMemo: '再追加後の編集' }, false));
    store = success(repo.recordAttempt(store, attempt(later[1]!.id, 'later-answer')));
    store = success(repo.confirmProblem(store, later[2]!.id));
    store = success(repo.setInTest(store, later[3]!.id, false));
    const beforeRestore = structuredClone(store);
    const result = repo.restoreSampleCatalog(store, id);
    store = success(result);
    expect(result).toMatchObject({ ok: true, preservedCopies: 4 });
    expect(store.problems).toHaveLength(14);
    expect(store.problems).toEqual(expect.arrayContaining(originals));
    expect(store.problems).toEqual(expect.arrayContaining(beforeRestore.problems.slice(0, 4)));
    expect(store.study).toEqual(expect.arrayContaining(beforeRestore.study.filter((state) => later.some(({ id: problemId }) => problemId === state.problemId))));
    expect(store.attempts).toEqual(beforeRestore.attempts);
    expect(store.daily).toEqual(beforeRestore.daily);
    expect(update(store).problems).toEqual(store.problems);
  });

  it('reconnects exact retained study and attempts when a later custom problem reuses the original ID', () => {
    let store = update();
    const original = store.problems[0]!;
    store = success(repo.recordAttempt(store, attempt(original.id, 'original-answer')));
    store = success(repo.confirmProblem(store, original.id));
    store = success(repo.updateUnderstanding(store, original.id, 'understood'));
    const originalState = structuredClone(store.study.find(({ problemId }) => problemId === original.id)!);
    store = remove(store);
    const id = lastBackup(store);
    const own = custom({ id: original.id, title: '同じIDで後から作った問題' });
    store = success(repo.replaceStore({ ...store, problems: [own] }));
    const beforeRestore = structuredClone(store);
    store = success(repo.restoreSampleCatalog(store, id));
    const restored = store.problems.find((problem) => problem.sample?.itemId === original.sample!.itemId)!;
    expect(restored.id).not.toBe(original.id);
    expect(store.problems.find(({ id: problemId }) => problemId === own.id)).toEqual(own);
    expect(store.study.find(({ problemId }) => problemId === restored.id)).toEqual({ ...originalState, problemId: restored.id });
    expect(store.study.find(({ problemId }) => problemId === own.id)).toMatchObject({
      confirmationCount: 0, contentRevision: 0, understanding: 'unrated', lastConfirmedAt: null,
      lastReviewedAt: null, lastSolvedAt: null, lastCorrectAt: null,
    });
    expect(store.attempts).toHaveLength(beforeRestore.attempts.length);
    expect(store.attempts[0]).toEqual({ ...beforeRestore.attempts[0], problemId: restored.id });
    expect(store.daily).toEqual(beforeRestore.daily);
    const restoredOnce = structuredClone(store);
    store = success(repo.restoreSampleCatalog(store, id));
    expect(store).toEqual(restoredOnce);
  });

  it.each(['snapshot study absent', 'current study absent'] as const)('handles a reused ID with %s without borrowing custom history', (kind) => {
    let store = update();
    const original = store.problems[0]!;
    store = success(repo.confirmProblem(store, original.id));
    const originalState = structuredClone(store.study.find(({ problemId }) => problemId === original.id)!);
    if (kind === 'snapshot study absent') store = success(repo.replaceStore({ ...store, study: store.study.filter(({ problemId }) => problemId !== original.id) }));
    store = remove(store);
    const id = lastBackup(store);
    const own = custom({ id: original.id });
    const customState = { ...originalState, confirmationCount: 9, understanding: 'uncertain' as const };
    store = success(repo.replaceStore({ ...store, problems: [own], study: [
      ...store.study.filter(({ problemId }) => problemId !== original.id),
      ...(kind === 'snapshot study absent' ? [customState] : []),
    ] }));
    store = success(repo.restoreSampleCatalog(store, id));
    const restored = store.problems.find((problem) => problem.sample?.itemId === original.sample!.itemId)!;
    if (kind === 'snapshot study absent') {
      expect(store.study.find(({ problemId }) => problemId === own.id)).toEqual(customState);
      expect(store.study.find(({ problemId }) => problemId === restored.id)).toBeUndefined();
    } else {
      expect(store.study.find(({ problemId }) => problemId === own.id)).toMatchObject({ confirmationCount: 0, understanding: 'unrated' });
      expect(store.study.find(({ problemId }) => problemId === restored.id)).toEqual({ ...originalState, problemId: restored.id });
    }
  });

  it.each(['changed study', 'later attempt'] as const)('refuses an ambiguous ID-reuse restore with %s without writing', (kind) => {
    let store = update();
    const original = store.problems[0]!;
    store = success(repo.recordAttempt(store, attempt(original.id, 'original-answer')));
    store = remove(store);
    const id = lastBackup(store);
    const own = custom({ id: original.id, title: '同じIDで後から作った問題' });
    store = success(repo.replaceStore({ ...store, problems: [own], study: store.study.map((state) =>
      kind === 'changed study' && state.problemId === own.id ? { ...state, confirmationCount: 9 } : state) }));
    if (kind === 'later attempt') store = success(repo.recordAttempt(store, attempt(own.id, 'later-custom-answer')));
    const before = structuredClone(store);
    const saved = [...data.entries()];
    const writes = vi.mocked(localStorage.setItem).mock.calls.length;
    expect(repo.restoreSampleCatalog(store, id)).toMatchObject({ ok: false, code: 'conflict' });
    expect(vi.mocked(localStorage.setItem).mock.calls).toHaveLength(writes);
    expect([...data.entries()]).toEqual(saved);
    expect(store).toEqual(before);
    expect(load()).toEqual(before);
  });

  it('refuses an old confirmation-only removal backup after its restored sample is confirmed again', () => {
    let store = update();
    const originalId = store.problems[0]!.id;
    store = success(repo.confirmProblem(store, originalId));
    store = remove(store);
    const backup = repo.exportJson(store);
    const id = lastBackup(store);
    store = success(repo.restoreSampleCatalog(store, id));
    store = success(repo.confirmProblem(store, originalId));
    const before = structuredClone(store);
    const saved = [...data.entries()];
    const writes = vi.mocked(localStorage.setItem).mock.calls.length;
    expect(repo.importJson(store, backup, 'merge')).toMatchObject({ ok: false, code: 'conflict' });
    expect(vi.mocked(localStorage.setItem).mock.calls).toHaveLength(writes);
    expect([...data.entries()]).toEqual(saved);
    expect(store).toEqual(before);
    expect(load()).toEqual(before);
  });

  it.each(['backup-quota', 'backup-readback', 'main-quota', 'late-read', 'concurrent'] as const)('does not overwrite originals after %s failure', (kind) => {
    const store = update();
    const before = data.get(KEY);
    const external = JSON.stringify({ ...store, revision: store.revision + 1, settings: { autoSort: false } });
    let backupKey: string | undefined;
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
      if (key.startsWith(PREFIX)) {
        if (kind === 'backup-quota') throw new DOMException('full', 'QuotaExceededError');
        backupKey = key;
      }
      if (key === KEY && kind === 'main-quota') throw new DOMException('full', 'QuotaExceededError');
      data.set(key, value);
      if (key === backupKey && kind === 'concurrent') data.set(KEY, external);
    });
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === backupKey && kind === 'backup-readback') return 'unverified';
      if (backupKey && key === KEY && kind === 'late-read') throw new Error('read denied');
      return data.get(key) ?? null;
    });
    const result = repo.removeSampleCatalog(store, store.problems.map(({ id }) => id));
    expect(result.ok).toBe(false);
    expect(data.get(KEY)).toBe(kind === 'concurrent' ? external : before);
    if (backupKey) expect(JSON.parse(data.get(backupKey)!).before).toEqual(store);
  });

  it('rejects stale targets, stale tabs and repeated activation without new writes', () => {
    let store = update();
    const ids = store.problems.map(({ id }) => id);
    const before = data.get(KEY);
    expect(repo.removeSampleCatalog(store, ids.slice(1))).toMatchObject({ ok: false, code: 'conflict' });
    expect(repo.removeSampleCatalog(store, [...ids, ids[0]!])).toMatchObject({ ok: false, code: 'conflict' });
    expect(data.get(KEY)).toBe(before);
    const old = store;
    store = success(repo.saveProblem(store, { ...store.problems[0]!, title: '更新したタイトル' }, false));
    const latest = data.get(KEY);
    expect(repo.removeSampleCatalog(old, ids)).toMatchObject({ ok: false, code: 'conflict' });
    expect(repo.removeSampleCatalog(store, ids)).toMatchObject({ ok: false, code: 'conflict' });
    expect(data.get(KEY)).toBe(latest);
    const targetIds = getSampleRemovalPreview(store).candidates.map(({ id }) => id);
    store = success(repo.removeSampleCatalog(store, targetIds));
    const after = data.get(KEY);
    expect(repo.removeSampleCatalog(store, targetIds)).toMatchObject({ ok: false, code: 'conflict' });
    expect(data.get(KEY)).toBe(after);
  });
});
