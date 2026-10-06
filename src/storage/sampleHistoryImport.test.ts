import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeStore } from '@/domain/records';
import {
  emptyContext, emptyStore, type Attempt, type LearningMaterial, type MaterialStudyEvent,
  type Problem, type Store, type StudyState,
} from '@/domain/types';
import { LocalStorageRepository, type SaveResult } from './repository';

const KEY = 'sample-history-import-test:v1';
const NOW = '2026-10-06T01:00:00.000Z';
const SOURCE_ID = 'deleted-sample';
let data: Map<string, string>;
let repo: LocalStorageRepository;

function problem(id: string, partial: Partial<Problem> = {}): Problem {
  return {
    id, title: `Problem ${id}`, concealed: ['1m', '2m', '3m'], drawn: null, melds: [],
    doraIndicators: [], answerEnabled: false, acceptedDiscards: [], explanation: '', privateMemo: '',
    tagIds: [], context: emptyContext(), attachments: [], sourceUrl: '', createdAt: NOW, updatedAt: NOW,
    ...partial,
  };
}

function state(problemId = SOURCE_ID, partial: Partial<StudyState> = {}): StudyState {
  return {
    problemId, contentRevision: 2, confirmationCount: 3, lastConfirmedAt: NOW,
    understanding: 'understood', lastReviewedAt: NOW, lastSolvedAt: NOW, lastCorrectAt: NOW,
    ...partial,
  };
}

function attempt(problemId = SOURCE_ID, partial: Partial<Attempt> = {}): Attempt {
  return {
    id: 'source-attempt', problemId, contentRevision: 2, sessionId: 'source-session', questionIndex: 0,
    at: NOW, selectedTile: '1m', result: 'correct', ...partial,
  };
}

function orphanBackup(partial: Partial<Store> = {}): Store {
  return {
    ...emptyStore(), study: [state()], attempts: [attempt()],
    daily: { '2026-10-06': { tested: 1, confirmed: 3 } }, ...partial,
  };
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

function seed(store = emptyStore()): Store {
  data.set(KEY, JSON.stringify(store));
  return load();
}

function reload(): Store {
  repo.dispose();
  repo = new LocalStorageRepository(KEY);
  return load();
}

function merge(current: Store, backup: Store): Store {
  return success(repo.importJson(current, JSON.stringify(backup), 'merge'));
}

function history(store: Store) {
  return { study: store.study, attempts: store.attempts };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  data = new Map();
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

describe('deleted sample history backup compatibility', () => {
  it('retains orphan history through load, export, reload and replace without restoring active problems', () => {
    const original = orphanBackup();
    const loaded = seed(original);
    expect(history(loaded)).toEqual(history(original));
    expect(history(reload())).toEqual(history(original));

    const exported = repo.exportJson(loaded);
    const current = seed({ ...emptyStore(), problems: [problem('other')] });
    const replaced = success(repo.importJson(current, exported, 'replace'));
    expect(replaced.problems).toEqual([]);
    expect(history(replaced)).toEqual(history(original));
    expect(replaced.daily).toEqual(original.daily);
    expect(history(reload())).toEqual(history(original));
  });

  it('normalizes legacy orphan dates and daily totals without discarding orphan records', () => {
    const legacy = orphanBackup({
      study: [state(SOURCE_ID, { lastSolvedAt: undefined, lastCorrectAt: undefined })],
      daily: undefined,
    });
    const loaded = seed(legacy);
    expect(loaded.study).toEqual([state()]);
    expect(loaded.attempts).toEqual(legacy.attempts);
    expect(loaded.daily).toEqual({ '2026-10-06': { tested: 1, confirmed: 0 } });
    expect(loaded.problems).toEqual([]);
  });
});

describe('orphan-only merge import', () => {
  const malformedHistories: [string, { study?: unknown[]; attempts?: unknown[] }][] = [
    ['absent study counters', { study: [{ problemId: SOURCE_ID }] }],
    ['missing confirmation count', { study: [state(SOURCE_ID, { confirmationCount: undefined })] }],
    ['nonnumeric confirmation count', { study: [{ ...state(), confirmationCount: '3' }] }],
    ['nonfinite confirmation count', { study: [state(SOURCE_ID, { confirmationCount: Infinity })] }],
    ['missing study revision', { study: [state(SOURCE_ID, { contentRevision: undefined })] }],
    ['nonnumeric study revision', { study: [{ ...state(), contentRevision: '2' }] }],
    ['empty study problem ID', { study: [state('')] }],
    ['whitespace study problem ID', { study: [state('  ')] }],
    ['nonstring study problem ID', { study: [{ ...state(), problemId: 42 }] }],
    ['null study row', { study: [null] }],
    ['primitive study row', { study: ['malformed'] }],
    ['array study row', { study: [[]] }],
    ['duplicate study problem IDs', { study: [state(), state(SOURCE_ID, { confirmationCount: 4 })] }],
    ['absent attempt fields', { attempts: [{ id: 'source-attempt', problemId: SOURCE_ID }] }],
    ['empty attempt ID', { attempts: [attempt(SOURCE_ID, { id: '' })] }],
    ['whitespace attempt ID', { attempts: [attempt(SOURCE_ID, { id: '  ' })] }],
    ['missing attempt ID', { attempts: [{ ...attempt(), id: undefined }] }],
    ['empty attempt problem ID', { attempts: [attempt('')] }],
    ['nonstring attempt problem ID', { attempts: [{ ...attempt(), problemId: 42 }] }],
    ['null attempt row', { attempts: [null] }],
    ['primitive attempt row', { attempts: [false] }],
    ['array attempt row', { attempts: [[]] }],
    ['missing attempt timestamp', { attempts: [{ ...attempt(), at: undefined }] }],
    ['invalid attempt timestamp', { attempts: [attempt(SOURCE_ID, { at: 'not-a-date' })] }],
    ['nonstring attempt timestamp', { attempts: [{ ...attempt(), at: 123 }] }],
    ['missing attempt revision', { attempts: [{ ...attempt(), contentRevision: undefined }] }],
    ['nonfinite attempt revision', { attempts: [attempt(SOURCE_ID, { contentRevision: Infinity })] }],
    ['missing session ID', { attempts: [{ ...attempt(), sessionId: undefined }] }],
    ['nonfinite question index', { attempts: [attempt(SOURCE_ID, { questionIndex: Infinity })] }],
    ['unknown attempt result', { attempts: [{ ...attempt(), result: 'unknown' }] }],
    ['duplicate attempt IDs within a group', { attempts: [attempt(), attempt(SOURCE_ID, { result: 'incorrect' })] }],
    ['duplicate attempt IDs across orphan groups', { attempts: [attempt(), attempt('another-orphan')] }],
  ];

  it.each(malformedHistories)('rejects %s without throwing or changing any saved data', (_label, fields) => {
    const current = seed({
      ...emptyStore(), problems: [problem('current')], study: [state('current')],
      attempts: [attempt('current', { id: 'current-attempt' })],
      daily: { '2026-10-05': { tested: 7, confirmed: 4 } },
    });
    const before = structuredClone(current);
    const savedBefore = [...data.entries()];
    const writesBefore = vi.mocked(localStorage.setItem).mock.calls.length;
    let result: SaveResult | undefined;
    expect(() => {
      result = repo.importJson(current, JSON.stringify({ ...orphanBackup(), ...fields }), 'merge');
    }).not.toThrow();
    expect(result).toMatchObject({ ok: false, code: 'validation' });
    expect(current).toEqual(before);
    expect([...data.entries()]).toEqual(savedBefore);
    expect(vi.mocked(localStorage.setItem).mock.calls).toHaveLength(writesBefore);
    expect(reload()).toEqual(before);
  });

  it('imports orphan study and attempts without creating a problem or changing daily totals', () => {
    const current = seed({ ...emptyStore(), daily: { '2026-10-05': { tested: 7, confirmed: 4 } } });
    const backup = orphanBackup();
    const before = structuredClone(backup);
    const merged = merge(current, backup);
    expect(merged.problems).toEqual([]);
    expect(merged.study).toEqual(backup.study);
    expect(merged.attempts).toEqual(backup.attempts);
    expect(merged.daily).toEqual(current.daily);
    expect(backup).toEqual(before);
  });

  it.each(['study only', 'attempts only'] as const)('retains a %s orphan group and imports it only once after reload', (kind) => {
    const backup = orphanBackup(kind === 'study only' ? { attempts: [] } : { study: [] });
    const first = merge(seed(), backup);
    expect(first.problems).toEqual([]);
    expect(history(first)).toEqual(history(backup));
    const second = merge(reload(), backup);
    expect(history(second)).toEqual(history(first));
    expect(second.problems).toEqual([]);
  });

  it.each(['orphan attempts', 'attempt ID'] as const)(
    'preserves current data when the source identity collides with an existing %s', (collision) => {
      const initial = emptyStore();
      if (collision === 'orphan attempts') {
        initial.attempts = [attempt(SOURCE_ID, { id: 'existing-history', result: 'incorrect' })];
      } else {
        initial.problems = [problem('current-problem')];
        initial.attempts = [attempt('current-problem', { result: 'incorrect' })];
      }
      const current = seed(initial);
      const before = structuredClone(current);
      const backup = orphanBackup();
      const merged = merge(current, backup);
      const incomingState = merged.study.find((entry) => entry.confirmationCount === 3)!;
      expect(incomingState).toBeDefined();
      expect(incomingState.problemId).not.toBe(SOURCE_ID);
      expect(merged.problems).toEqual(before.problems);
      expect(merged.problems.some((entry) => entry.id === incomingState.problemId)).toBe(false);
      expect(merged.study).toEqual(expect.arrayContaining(before.study));
      expect(merged.attempts).toEqual(expect.arrayContaining(before.attempts));
      expect(merged.study).toHaveLength(before.study.length + 1);
      expect(merged.attempts).toHaveLength(before.attempts.length + 1);
      expect(merged.attempts.find((entry) => entry.problemId === incomingState.problemId)).toMatchObject({
        ...backup.attempts[0], id: expect.any(String), problemId: incomingState.problemId,
      });
      expect(new Set(merged.attempts.map((entry) => entry.id)).size).toBe(merged.attempts.length);
      expect(current).toEqual(before);
      expect(history(merge(reload(), backup))).toEqual(history(merged));
    },
  );

  it('probes occupied deterministic problem and attempt IDs without overwriting or duplicating on retry', () => {
    const namespace = `sample-history:${JSON.stringify(SOURCE_ID)}`;
    const current = seed({
      ...emptyStore(),
      problems: [problem(SOURCE_ID), problem(namespace)],
      attempts: [attempt('unrelated-orphan', {
        id: `${namespace}:1:attempt:${JSON.stringify('source-attempt')}`, result: 'incorrect',
      })],
    });
    const backup = orphanBackup();
    const merged = merge(current, backup);
    expect(merged.problems).toEqual(current.problems);
    expect(merged.attempts).toEqual(expect.arrayContaining(current.attempts));
    expect(merged.attempts).toHaveLength(2);
    expect(new Set(merged.attempts.map((entry) => entry.id)).size).toBe(2);
    expect(merged.study).toHaveLength(1);
    expect(merged.problems.some((entry) => entry.id === merged.study[0]!.problemId)).toBe(false);
    expect(history(merge(reload(), backup))).toEqual(history(merged));
  });

  it('does not duplicate an existing exact orphan group, even after normalized dates are populated on reload', () => {
    const backup = orphanBackup({
      study: [state(SOURCE_ID, { lastSolvedAt: undefined, lastCorrectAt: undefined })],
    });
    const current = seed(backup);
    const first = merge(current, backup);
    expect(history(first)).toEqual(history(normalizeStore(backup)));
    expect(history(merge(reload(), backup))).toEqual(history(first));
  });

  it.each([
    'changed study and extra attempt',
    'unchanged study and extra attempt',
    'changed content under the same attempt ID',
    'changed history after a namespaced import',
    'a new group before the conflicting group',
  ] as const)('refuses overlapping %s without changing current or incoming data', (kind) => {
    const initial = kind === 'changed history after a namespaced import'
      ? { ...emptyStore(), problems: [problem(SOURCE_ID)] }
      : emptyStore();
    merge(seed(initial), orphanBackup());
    const current = reload();
    if (kind === 'changed history after a namespaced import') {
      expect(current.study[0]!.problemId).not.toBe(SOURCE_ID);
      expect(current.attempts[0]!.id).not.toBe('source-attempt');
    }
    const extraAttempt = attempt(SOURCE_ID, {
      id: 'later-attempt', questionIndex: 1, at: '2026-10-06T02:00:00.000Z',
    });
    const backup = orphanBackup({
      study: [kind === 'unchanged study and extra attempt' || kind === 'changed content under the same attempt ID'
        ? state() : state(SOURCE_ID, { confirmationCount: 4, lastReviewedAt: extraAttempt.at })],
      attempts: kind === 'changed content under the same attempt ID'
        ? [attempt(SOURCE_ID, { result: 'incorrect' })]
        : [attempt(), extraAttempt],
    });
    if (kind === 'a new group before the conflicting group') {
      backup.problems = [problem('new-active', { tagIds: ['new-tag'] })];
      backup.tags = [{ id: 'new-tag', name: 'Must not be saved' }];
      backup.study.unshift(state('new-orphan'));
      backup.attempts.unshift(attempt('new-orphan', { id: 'new-orphan-attempt' }));
    }
    const currentBefore = structuredClone(current);
    const incomingBefore = structuredClone(backup);
    const savedBefore = [...data.entries()];
    const writesBefore = vi.mocked(localStorage.setItem).mock.calls.length;
    let result: SaveResult | undefined;
    expect(() => {
      result = repo.importJson(current, JSON.stringify(backup), 'merge');
    }).not.toThrow();
    expect(result).toMatchObject({ ok: false, code: 'conflict' });
    expect(current).toEqual(currentBefore);
    expect(backup).toEqual(incomingBefore);
    expect([...data.entries()]).toEqual(savedBefore);
    expect(vi.mocked(localStorage.setItem).mock.calls).toHaveLength(writesBefore);
    expect(reload()).toEqual(currentBefore);
  });

  it('recognizes an unchanged orphan history after its original card becomes active again', () => {
    const backup = orphanBackup();
    const current = seed({ ...backup, problems: [problem(SOURCE_ID)] });
    const merged = merge(current, backup);
    expect(history(merged)).toEqual(history(current));
    expect(merged.problems).toEqual(current.problems);
    expect(merged.daily).toEqual(current.daily);
  });

  it.each(['study only', 'attempts only', 'study and attempts'] as const)(
    'reuses the saved namespace for %s even after the original ID becomes free', (kind) => {
      const backup = orphanBackup(kind === 'study only' ? { attempts: [] } : kind === 'attempts only' ? { study: [] } : {});
      let current = seed({ ...emptyStore(), problems: [problem(SOURCE_ID)] });
      current = merge(current, backup);
      current = success(repo.deleteProblem(current, SOURCE_ID));
      const before = structuredClone(current);
      const merged = merge(reload(), backup);
      expect(history(merged)).toEqual(history(before));
      expect(merged.problems).toEqual([]);
      expect(merged.daily).toEqual(before.daily);
      expect(backup).toEqual(orphanBackup(kind === 'study only' ? { attempts: [] } : kind === 'attempts only' ? { study: [] } : {}));
    },
  );

  it('finds an existing higher namespace after every earlier problem-ID collision disappears', () => {
    const namespace = `sample-history:${JSON.stringify(SOURCE_ID)}`;
    let current = seed({ ...emptyStore(), problems: [problem(SOURCE_ID), problem(namespace), problem(`${namespace}:1`)] });
    const backup = orphanBackup();
    current = merge(current, backup);
    expect(current.study[0]!.problemId).toBe(`${namespace}:2`);
    for (const id of [SOURCE_ID, namespace, `${namespace}:1`]) current = success(repo.deleteProblem(current, id));
    const before = structuredClone(current);
    expect(history(merge(reload(), backup))).toEqual(history(before));
  });

  it('recognizes exact events reconnected by restore to a different active problem ID', () => {
    const backup = orphanBackup();
    const current = seed({ ...emptyStore(), problems: [problem('restored-original')],
      study: [state('restored-original')], attempts: [attempt('restored-original')] });
    const merged = merge(current, backup);
    expect(history(merged)).toEqual(history(current));
    expect(merged.problems).toEqual(current.problems);
  });

  it.each(['active original', 'freed original ID', 'reconnected original'] as const)(
    'refuses changed overlap with an %s before allocating a fresh history group', (kind) => {
      const backup = orphanBackup();
      let current: Store;
      if (kind === 'freed original ID') {
        current = merge(seed({ ...emptyStore(), problems: [problem(SOURCE_ID)] }), backup);
        current = success(repo.deleteProblem(current, SOURCE_ID));
      } else {
        const id = kind === 'active original' ? SOURCE_ID : 'restored-original';
        current = seed({ ...emptyStore(), problems: [problem(id)], study: [state(id)], attempts: [attempt(id)] });
      }
      const historyId = current.study[0]!.problemId;
      current = success(repo.replaceStore({ ...current,
        study: current.study.map((entry) => ({ ...entry, confirmationCount: entry.confirmationCount + 1 })),
        attempts: [...current.attempts, attempt(historyId, { id: 'later-event', result: 'incorrect' })],
      }));
      const before = structuredClone(current);
      const incomingBefore = structuredClone(backup);
      const savedBefore = [...data.entries()];
      const writesBefore = vi.mocked(localStorage.setItem).mock.calls.length;
      expect(repo.importJson(current, JSON.stringify(backup), 'merge')).toMatchObject({ ok: false, code: 'conflict' });
      expect(vi.mocked(localStorage.setItem).mock.calls).toHaveLength(writesBefore);
      expect([...data.entries()]).toEqual(savedBefore);
      expect(current).toEqual(before);
      expect(backup).toEqual(incomingBefore);
      expect(reload()).toEqual(before);
    },
  );

  it.each(['original orphan', 'namespaced orphan', 'freed original ID'] as const)(
    'refuses changed confirmation-only history for an %s without answer events or writes', (kind) => {
      const firstBackup = orphanBackup({ attempts: [] });
      let current = seed(kind === 'original orphan' ? emptyStore() : { ...emptyStore(), problems: [problem(SOURCE_ID)] });
      current = merge(current, firstBackup);
      if (kind === 'freed original ID') current = success(repo.deleteProblem(current, SOURCE_ID));
      const changedBackup = orphanBackup({ attempts: [], study: [state(SOURCE_ID, { confirmationCount: 4 })] });
      const before = structuredClone(current);
      const incomingBefore = structuredClone(changedBackup);
      const savedBefore = [...data.entries()];
      const writesBefore = vi.mocked(localStorage.setItem).mock.calls.length;
      expect(repo.importJson(current, JSON.stringify(changedBackup), 'merge')).toMatchObject({ ok: false, code: 'conflict' });
      expect(vi.mocked(localStorage.setItem).mock.calls).toHaveLength(writesBefore);
      expect([...data.entries()]).toEqual(savedBefore);
      expect(current).toEqual(before);
      expect(changedBackup).toEqual(incomingBefore);
      expect(reload()).toEqual(before);
    },
  );

  it.each([false, true])('refuses ambiguous study at a reused active card ID (incoming answers: %s)', (withAnswers) => {
    const current = seed({ ...emptyStore(), problems: [problem(SOURCE_ID)], study: [state(SOURCE_ID, { confirmationCount: 99 })] });
    const backup = orphanBackup(withAnswers ? {} : { attempts: [] });
    const before = structuredClone(current);
    const savedBefore = [...data.entries()];
    const writesBefore = vi.mocked(localStorage.setItem).mock.calls.length;
    expect(repo.importJson(current, JSON.stringify(backup), 'merge')).toMatchObject({ ok: false, code: 'conflict' });
    expect(vi.mocked(localStorage.setItem).mock.calls).toHaveLength(writesBefore);
    expect([...data.entries()]).toEqual(savedBefore);
    expect(current).toEqual(before);
  });

  it('keeps different source attempt IDs when their complete other payload is identical', () => {
    const backup = orphanBackup({ attempts: [attempt(SOURCE_ID, { id: 'attempt-a' }), attempt(SOURCE_ID, { id: 'attempt-b' })] });
    const current = seed({ ...emptyStore(), problems: [problem(SOURCE_ID)] });
    const first = merge(current, backup);
    expect(first.attempts).toHaveLength(2);
    expect(new Set(first.attempts.map((entry) => entry.id)).size).toBe(2);
    expect(new Set(first.attempts.map((entry) => entry.problemId)).size).toBe(1);
    expect(first.attempts[0]).toEqual({ ...first.attempts[1], id: first.attempts[0]!.id });
    expect(history(merge(reload(), backup))).toEqual(history(first));
  });

  it('handles multiple orphan groups independently, including study-only and attempts-only histories', () => {
    const backup = orphanBackup({
      study: [state('group-a'), state('group-b')],
      attempts: [attempt('group-a', { id: 'attempt-a' }), attempt('group-c', { id: 'attempt-c' })],
    });
    const first = merge(seed(), backup);
    expect(first.problems).toEqual([]);
    expect(history(first)).toEqual(history(backup));
    expect(history(merge(reload(), backup))).toEqual(history(first));
  });

  it('leaves active problem duplication, tag merging, material deduplication and daily policy intact', () => {
    const material: LearningMaterial = {
      id: 'material', title: 'Current material', url: 'https://example.com/lesson', comment: 'Current note',
      createdAt: NOW, updatedAt: NOW,
    };
    const event: MaterialStudyEvent = {
      id: 'material-event', materialId: material.id, at: NOW,
      title: material.title, url: material.url, comment: 'Studied this lesson',
    };
    const current = seed({
      ...emptyStore(), problems: [problem('current')], tags: [{ id: 'current-tag', name: 'Existing tag' }],
      study: [state('current')], attempts: [attempt('current', { id: 'current-attempt' })],
      daily: { '2026-10-05': { tested: 8, confirmed: 5 } }, settings: { autoSort: false },
      materials: [material], materialStudyEvents: [event],
    });
    const backup = orphanBackup({
      problems: [problem('active-in-backup', { tagIds: ['incoming-tag'] })],
      tags: [{ id: 'incoming-tag', name: 'Existing tag' }],
      study: [state('active-in-backup'), state()],
      attempts: [attempt('active-in-backup', { id: 'active-attempt' }), attempt()],
      materials: [{ ...material, title: 'Old material', comment: 'Old note' }], materialStudyEvents: [event],
    });
    const first = merge(current, backup);
    const imported = first.problems.find((entry) => entry.title === 'Problem active-in-backup')!;
    expect(imported).toBeDefined();
    expect(imported.id).not.toBe('active-in-backup');
    expect(imported.tagIds).toEqual(['current-tag']);
    expect(first.problems).toHaveLength(2);
    expect(first.problems[0]).toEqual(current.problems[0]);
    expect(first.study.find((entry) => entry.problemId === imported.id)).toEqual(state(imported.id));
    expect(first.attempts.find((entry) => entry.problemId === imported.id)).toMatchObject({
      ...attempt('active-in-backup', { id: 'active-attempt' }), id: expect.any(String), problemId: imported.id,
    });
    expect(first.attempts.find((entry) => entry.problemId === imported.id)?.id).not.toBe('active-attempt');
    expect(first.study.find((entry) => entry.problemId === SOURCE_ID)).toEqual(state());
    expect(first.attempts.find((entry) => entry.problemId === SOURCE_ID)).toEqual(attempt());
    expect(first.tags).toEqual(current.tags);
    expect(first.daily).toEqual(current.daily);
    expect(first.settings).toEqual(current.settings);
    expect(first.materials).toHaveLength(1);
    expect(first.materials).toMatchObject([material]);
    expect(first.materialStudyEvents).toHaveLength(1);
    expect(first.materialStudyEvents).toMatchObject([event]);

    const second = merge(reload(), backup);
    expect(second.problems).toHaveLength(3);
    expect(second.problems.filter((entry) => entry.title === imported.title)).toHaveLength(2);
    expect(second.study.filter((entry) => entry.problemId === SOURCE_ID)).toEqual([state()]);
    expect(second.attempts.filter((entry) => entry.problemId === SOURCE_ID)).toEqual([attempt()]);
    expect(second.materials).toEqual(first.materials);
    expect(second.materialStudyEvents).toEqual(first.materialStudyEvents);
    expect(second.daily).toEqual(current.daily);
    expect(second.settings).toEqual(current.settings);
  });
});
