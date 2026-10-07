import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { countMaterialStudies, MATERIAL_LIMITS, materialSourceIds, materialStudySourceIds } from '@/domain/materials';
import { emptyStore, type LearningMaterial, type MaterialStudyEvent, type Store } from '@/domain/types';
import { LocalStorageRepository, type SaveResult } from './repository';

const KEY = 'materials-test:v1';
const NOW = '2026-10-05T10:00:00.000Z';
let data: Map<string, string>;
let repo: LocalStorageRepository;

function material(partial: Partial<LearningMaterial> = {}): LearningMaterial {
  return { id: 'material1', title: '押し引き講座', url: 'https://www.youtube.com/watch?v=abc', comment: '自分のメモ',
    createdAt: NOW, updatedAt: NOW, ...partial };
}
function event(partial: Partial<MaterialStudyEvent> = {}): MaterialStudyEvent {
  return { id: 'event1', materialId: 'material1', at: NOW,
    title: '学習した時の教材名', url: 'https://www.youtube.com/watch?v=abc', comment: '学習した時のコメント', ...partial };
}
function success(result: SaveResult): Store {
  expect(result.ok, result.ok ? '' : result.reason).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.store;
}
function load(): Store {
  const result = repo.load();
  if (!result.ok) throw new Error(result.reason);
  return result.store;
}
function add(store = load(), input = material()): Store {
  return success(repo.saveMaterial(store, input));
}
function questionFields(store: Store) {
  return { problems: store.problems, tags: store.tags, study: store.study, attempts: store.attempts,
    daily: store.daily, settings: store.settings };
}
function withQuestion(): Store {
  let store = success(repo.saveProblem(load(), createLegacySampleProblems().problems[0]!, true));
  store = success(repo.confirmProblem(store, store.problems[0]!.id));
  return success(repo.recordAttempt(store, {
    id: 'attempt1', problemId: store.problems[0]!.id, contentRevision: 0, sessionId: 'session',
    questionIndex: 0, at: NOW, selectedTile: null, result: 'selfReview',
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  // Existing-user fixture; first-use defaults are covered in initialMaterials.test.ts.
  data = new Map([[KEY, JSON.stringify(emptyStore())]]);
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn((key: string) => { data.delete(key); }),
    key: vi.fn((index: number) => [...data.keys()][index] ?? null),
    clear: vi.fn(() => data.clear()),
    get length() { return data.size; },
  } as Storage);
  repo = new LocalStorageRepository(KEY);
});
afterEach(() => {
  repo.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('material storage and manual study events', () => {
  it('registers normalized URLs and editable titles without fetching metadata or adding study counts', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const before = withQuestion();
    const original = structuredClone(before);
    const store = add(before, material({ title: ' 教材のタイトル ', url: 'HTTPS://WWW.YouTube.COM:443/watch?v=abc' }));
    expect(store.materials).toEqual([{ ...material({ title: '教材のタイトル' }), sourceIds: materialSourceIds(material()) }]);
    expect(countMaterialStudies(store.materialStudyEvents)).toBe(0);
    expect(questionFields(store)).toEqual(questionFields(before));
    expect(before).toEqual(original);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(load().materials).toEqual(store.materials);
  });

  it('rejects a canonical duplicate and exposes the existing material without replacing its comment', () => {
    const store = add();
    const before = data.get(KEY);
    const writes = vi.mocked(localStorage.setItem).mock.calls.length;
    expect(repo.saveMaterial(store, material({ id: 'new', title: '別名', comment: '上書きしない',
      url: 'HTTPS://WWW.YOUTUBE.COM:443/watch?v=abc' }))).toMatchObject({
      ok: false, code: 'validation', duplicateMaterialId: 'material1',
    });
    expect(data.get(KEY)).toBe(before);
    expect(vi.mocked(localStorage.setItem).mock.calls).toHaveLength(writes);
  });

  it('commits the current note and a title/URL/comment snapshot in one write, separately from question records', () => {
    let store = add(withQuestion());
    const before = structuredClone(store);
    const writes = vi.mocked(localStorage.setItem).mock.calls.length;
    store = success(repo.recordMaterialStudy(store, 'material1', '押し引きの条件を理解した', 'event1'));
    expect(vi.mocked(localStorage.setItem).mock.calls).toHaveLength(writes + 1);
    expect(store.materials?.[0]?.comment).toBe('押し引きの条件を理解した');
    const recorded = event({ title: material().title, comment: '押し引きの条件を理解した' });
    expect(store.materialStudyEvents).toEqual([{ ...recorded, sourceIds: materialStudySourceIds(recorded) }]);
    expect(questionFields(store)).toEqual(questionFields(before));
    expect(countMaterialStudies(store.materialStudyEvents)).toBe(1);
    expect(load().materialStudyEvents).toEqual(store.materialStudyEvents);
    vi.setSystemTime(new Date('2026-10-06T11:00:00.000Z'));
    store = success(repo.saveMaterial(store, { ...store.materials![0]!,
      title: '教材名を編集', url: 'https://note.com/author/n/new', comment: '次のメモ', createdAt: '2020-01-01T00:00:00Z' }));
    expect(store.materials?.[0]).toMatchObject({ title: '教材名を編集', createdAt: NOW, updatedAt: '2026-10-06T11:00:00.000Z' });
    expect(store.materialStudyEvents?.[0]).toMatchObject({ title: material().title, url: material().url, comment: '押し引きの条件を理解した' });
    expect(questionFields(store)).toEqual(questionFields(before));
  });

  it('makes repeated same-event requests idempotent and rejects conflicting use of an ID', () => {
    let store = add();
    store = success(repo.recordMaterialStudy(store, 'material1', '学習コメント', 'event1'));
    store = success(repo.saveMaterial(store, { ...store.materials![0]!, comment: '後から編集' }));
    const before = data.get(KEY);
    expect(success(repo.recordMaterialStudy(store, 'material1', '学習コメント', 'event1'))).toBe(store);
    expect(data.get(KEY)).toBe(before);
    expect(repo.recordMaterialStudy(store, 'material1', '別のコメント', 'event1')).toMatchObject({ ok: false, code: 'validation' });
    expect(data.get(KEY)).toBe(before);
    expect(countMaterialStudies(load().materialStudyEvents)).toBe(1);
    expect(load().materials?.[0]?.comment).toBe('後から編集');
  });

  it('undoes the exact event across midnight without rolling back a newer comment or question totals', () => {
    let store = add(withQuestion());
    const questions = questionFields(store);
    store = success(repo.recordMaterialStudy(store, 'material1', '1回目', 'event1'));
    vi.setSystemTime(new Date('2026-10-06T01:00:00.000Z'));
    store = success(repo.recordMaterialStudy(store, 'material1', '2回目', 'event2'));
    store = success(repo.undoMaterialStudy(store, 'event1'));
    expect(store.materialStudyEvents?.map((item) => item.id)).toEqual(['event2']);
    expect(store.materials?.[0]?.comment).toBe('2回目');
    expect(questionFields(store)).toEqual(questions);
    expect(countMaterialStudies(store.materialStudyEvents)).toBe(1);
    const before = data.get(KEY);
    expect(success(repo.undoMaterialStudy(store, 'event1'))).toBe(store);
    expect(data.get(KEY)).toBe(before);
  });

  it('rejects unknown material IDs and invalid comments without changing either collection', () => {
    const store = add();
    const before = data.get(KEY);
    expect(repo.recordMaterialStudy(store, 'missing', 'memo', 'event1')).toMatchObject({ ok: false, code: 'validation' });
    expect(repo.recordMaterialStudy(store, 'material1', 'x'.repeat(MATERIAL_LIMITS.comment + 1), 'event1')).toMatchObject({ ok: false, code: 'validation' });
    expect(repo.recordMaterialStudy(store, 'material1', 'memo', '')).toMatchObject({ ok: false, code: 'validation' });
    expect(data.get(KEY)).toBe(before);
  });

  it.each(['save', 'record', 'undo'] as const)('leaves persisted and in-memory data intact when %s hits quota', (action) => {
    let store = add();
    store = success(repo.recordMaterialStudy(store, 'material1', '最初', 'event1'));
    const before = data.get(KEY);
    const original = structuredClone(store);
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    const result = action === 'save' ? repo.saveMaterial(store, { ...material(), comment: '新しいメモ' })
      : action === 'record' ? repo.recordMaterialStudy(store, 'material1', '新しいメモ', 'event2')
        : repo.undoMaterialStudy(store, 'event1');
    expect(result).toMatchObject({ ok: false, code: 'quota' });
    expect(data.get(KEY)).toBe(before);
    expect(store).toEqual(original);
  });

  it('rejects stale data from another tab and an earlier same-tab render', () => {
    const first = add();
    const latest = success(repo.recordMaterialStudy(first, 'material1', '保存済み', 'event1'));
    const raw = data.get(KEY);
    expect(repo.recordMaterialStudy(first, 'material1', '古い画面', 'event2')).toMatchObject({ ok: false, code: 'conflict' });
    expect(data.get(KEY)).toBe(raw);
    data.set(KEY, JSON.stringify({ ...latest, revision: latest.revision + 1 }));
    const external = data.get(KEY);
    expect(repo.undoMaterialStudy(latest, 'event1')).toMatchObject({ ok: false, code: 'conflict' });
    expect(data.get(KEY)).toBe(external);
  });

  it('rechecks the complete persisted value before its atomic write, including same-revision changes', () => {
    const store = add();
    const external = JSON.stringify({ ...store, materials: [{ ...store.materials![0]!, comment: '別タブのメモ' }] });
    let reads = 0;
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      reads += 1;
      if (reads === 2) data.set(KEY, external);
      return data.get(key) ?? null;
    });
    expect(repo.recordMaterialStudy(store, 'material1', '上書きしない', 'event1')).toMatchObject({ ok: false, code: 'conflict' });
    expect(data.get(KEY)).toBe(external);
  });

  it('does not recreate a removed store or overwrite corrupt storage', () => {
    const store = add();
    data.delete(KEY);
    expect(repo.recordMaterialStudy(store, 'material1', '', 'event1')).toMatchObject({ ok: false, code: 'conflict' });
    expect(data.has(KEY)).toBe(false);
    data.set(KEY, '{broken');
    expect(repo.saveMaterial(store, material())).toMatchObject({ ok: false, code: 'corrupt' });
    expect(data.get(KEY)).toBe('{broken');
  });
});

describe('material backups', () => {
  it('loads old schema-one data, keeps materials on old-backup merge and removes them on explicit replacement', () => {
    const old = emptyStore();
    delete old.daily;
    data.set(KEY, JSON.stringify(old));
    expect(load().materials).toBeUndefined();
    let store = add(load());
    store = success(repo.recordMaterialStudy(store, 'material1', '復習', 'event1'));
    const originalMaterials = store.materials;
    const originalEvents = store.materialStudyEvents;
    store = success(repo.importJson(store, JSON.stringify(old), 'merge'));
    expect(store.materials).toEqual(originalMaterials);
    expect(store.materialStudyEvents).toEqual(originalEvents);
    store = success(repo.importJson(store, JSON.stringify(old), 'replace'));
    expect(store.materials).toBeUndefined();
    expect(store.materialStudyEvents).toBeUndefined();
  });

  it('exports and replaces all materials and snapshots losslessly', () => {
    let store = add();
    store = success(repo.recordMaterialStudy(store, 'material1', '以前のメモ', 'event1'));
    store = success(repo.saveMaterial(store, { ...material(), title: '今の教材名', comment: '今のメモ' }));
    const backup = repo.exportJson(store);
    const before = structuredClone(store);
    store = success(repo.importJson(store, backup, 'replace'));
    expect(store.materials).toEqual(before.materials);
    expect(store.materialStudyEvents).toEqual(before.materialStudyEvents);
    expect(load().materialStudyEvents).toEqual(before.materialStudyEvents);
  });

  it('merges equivalent URLs, remaps references, preserves current notes and repeats without double-counting', () => {
    let store = add();
    const backup: Store = { ...emptyStore(),
      materials: [material({ id: 'foreign', title: 'バックアップの名前', comment: 'バックアップのメモ', url: 'HTTPS://WWW.YouTube.COM:443/watch?v=abc' })],
      materialStudyEvents: [event({ materialId: 'foreign' })] };
    store = success(repo.importJson(store, JSON.stringify(backup), 'merge'));
    const sourceIds = [...materialSourceIds(material()), ...materialSourceIds(material({ id: 'foreign' }))];
    const savedEvent = { ...event(), sourceIds: materialStudySourceIds(event({ materialId: 'foreign' })) };
    expect(store.materials).toEqual([{ ...material(), sourceIds }]);
    expect(store.materialStudyEvents).toEqual([savedEvent]);
    store = success(repo.importJson(store, JSON.stringify(backup), 'merge'));
    expect(store.materials).toHaveLength(1);
    expect(store.materialStudyEvents).toEqual([savedEvent]);
    expect(countMaterialStudies(store.materialStudyEvents)).toBe(1);
  });

  it('preserves distinct colliding material/event IDs and makes collision handling idempotent', () => {
    let store = add();
    store = success(repo.recordMaterialStudy(store, 'material1', '手元の記録', 'event1'));
    const backup: Store = { ...emptyStore(), materials: [material({ url: 'https://note.com/author/n/other', comment: '別の教材' })],
      materialStudyEvents: [event({ url: 'https://note.com/author/n/other', comment: '取り込む記録' })] };
    store = success(repo.importJson(store, JSON.stringify(backup), 'merge'));
    const imported = store.materials!.find((item) => item.url === backup.materials![0]!.url)!;
    expect(imported.id).not.toBe('material1');
    expect(store.materialStudyEvents).toHaveLength(2);
    expect(store.materialStudyEvents?.[1]).toMatchObject({ materialId: imported.id, comment: '取り込む記録' });
    expect(new Set(store.materialStudyEvents?.map((item) => item.id)).size).toBe(2);
    const before = structuredClone(store);
    store = success(repo.importJson(store, JSON.stringify(backup), 'merge'));
    expect(store.materials).toEqual(before.materials);
    expect(store.materialStudyEvents).toEqual(before.materialStudyEvents);
  });

  it.each([false, true])('does not count the same backup again after an imported material URL is edited (collision=%s)', (collision) => {
    let store = collision ? add() : load();
    if (collision) store = success(repo.recordMaterialStudy(store, 'material1', '手元の記録', 'event1'));
    const backup: Store = { ...emptyStore(), materials: [material({ url: 'https://note.com/original' })],
      materialStudyEvents: [event({ url: 'https://note.com/original' })] };
    store = success(repo.importJson(store, JSON.stringify(backup), 'merge'));
    const imported = store.materials!.find((item) => item.url === 'https://note.com/original')!;
    store = success(repo.saveMaterial(store, { ...imported, url: 'https://note.com/edited', comment: '新しいURLとメモ' }));
    const before = structuredClone(store);
    store = success(repo.importJson(store, JSON.stringify(backup), 'merge'));
    expect(store.materials).toEqual(before.materials);
    expect(store.materialStudyEvents).toEqual(before.materialStudyEvents);
  });

  it('does not duplicate a previously remapped event when an earlier collision has been undone', () => {
    let store = add();
    store = success(repo.recordMaterialStudy(store, 'material1', '手元の記録', 'event1'));
    const backup: Store = { ...emptyStore(), materials: [material()], materialStudyEvents: [event()] };
    store = success(repo.importJson(store, JSON.stringify(backup), 'merge'));
    const importedEvent = store.materialStudyEvents![1]!;
    store = success(repo.undoMaterialStudy(store, 'event1'));
    store = success(repo.importJson(store, JSON.stringify(backup), 'merge'));
    expect(store.materialStudyEvents).toEqual([importedEvent]);
  });

  it('keeps separately recorded events even when their timestamp and content are identical', () => {
    let store = add();
    const backup: Store = { ...emptyStore(), materials: [material()],
      materialStudyEvents: [event(), event({ id: 'event2' })] };
    store = success(repo.importJson(store, JSON.stringify(backup), 'merge'));
    expect(countMaterialStudies(store.materialStudyEvents)).toBe(2);
    store = success(repo.importJson(store, JSON.stringify(backup), 'merge'));
    expect(countMaterialStudies(store.materialStudyEvents)).toBe(2);
  });

  it.each([
    { materials: null }, { materials: [null] },
    { materials: [material({ url: 'javascript:alert(1)' })] },
    { materials: [material(), material({ id: 'other' })] },
    { materials: [material()], materialStudyEvents: [event({ materialId: 'missing' })] },
    { materials: [material()], materialStudyEvents: [event(), event()] },
    { materials: [material()], materialStudyEvents: [{ ...event(), comment: 42 }] },
  ])('rejects malformed added fields on load and both import modes before any write %#', (fields) => {
    const store = add();
    const before = data.get(KEY);
    const malformed = JSON.stringify({ ...emptyStore(), ...fields });
    const writes = vi.mocked(localStorage.setItem).mock.calls.length;
    for (const mode of ['merge', 'replace'] as const) {
      expect(repo.importJson(store, malformed, mode)).toMatchObject({ ok: false, code: 'validation' });
      expect(data.get(KEY)).toBe(before);
    }
    expect(vi.mocked(localStorage.setItem).mock.calls).toHaveLength(writes);
    data.set(KEY, malformed);
    expect(repo.load()).toMatchObject({ ok: false, code: 'corrupt', raw: malformed });
    expect(data.get(KEY)).toBe(malformed);
  });

  it.each(['merge', 'replace'] as const)('keeps all original data if a %s import cannot be saved', (mode) => {
    const store = add();
    const before = data.get(KEY);
    const backup = JSON.stringify({ ...emptyStore(), materials: [material({ id: 'other', url: 'https://note.com/a' })], materialStudyEvents: [] });
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(repo.importJson(store, backup, mode)).toMatchObject({ ok: false, code: 'quota' });
    expect(data.get(KEY)).toBe(before);
    expect(store.materials).toEqual([{ ...material(), sourceIds: materialSourceIds(material()) }]);
  });

  it.each(['merge', 'replace'] as const)('rejects a stale %s import without losing a newer study event', (mode) => {
    const stale = add();
    const current = success(repo.recordMaterialStudy(stale, 'material1', '新しく記録した内容', 'event1'));
    const before = data.get(KEY);
    expect(repo.importJson(stale, repo.exportJson(stale), mode)).toMatchObject({ ok: false, code: 'conflict' });
    expect(data.get(KEY)).toBe(before);
    expect(load().materialStudyEvents).toEqual(current.materialStudyEvents);
  });

  it('rejects invalid material fields before a sample update can create a snapshot', () => {
    const bad: Store = { ...emptyStore(), materials: [material({ url: 'javascript:alert(1)' })] };
    data.set(KEY, JSON.stringify(bad));
    const before = [...data.entries()];
    expect(repo.updateSampleCatalog(bad, [])).toMatchObject({ ok: false, code: 'validation' });
    expect([...data.entries()]).toEqual(before);
  });

  it('captures materials in raw sample snapshots and preserves later material work when restoring problems', () => {
    const legacy = createLegacySampleProblems();
    let store = success(repo.addProblems(load(), legacy.problems, legacy.tagName));
    store = add(store);
    store = success(repo.recordMaterialStudy(store, 'material1', '更新前の教材記録', 'event1'));
    const before = structuredClone(store);
    store = success(repo.updateSampleCatalog(store, store.problems.map((problem) => problem.id)));
    const backupId = store.sampleCatalogUpdates![0]!.id;
    const snapshot = repo.exportSampleCatalogSnapshot(backupId);
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) throw new Error(snapshot.reason);
    expect(JSON.parse(snapshot.text)).toEqual(before);
    store = add(store, material({ id: 'later', url: 'https://note.com/author/n/later', title: '追加した教材' }));
    store = success(repo.recordMaterialStudy(store, 'later', '更新後の教材記録', 'event2'));
    store = success(repo.saveMaterial(store, { ...store.materials![0]!, comment: '更新後に編集したメモ' }));
    const laterMaterials = structuredClone(store.materials);
    const laterEvents = structuredClone(store.materialStudyEvents);
    store = success(repo.restoreSampleCatalog(store, backupId));
    expect(store.materials).toEqual(laterMaterials);
    expect(store.materialStudyEvents).toEqual(laterEvents);
    expect(store.problems).toEqual(before.problems);
  });
});
