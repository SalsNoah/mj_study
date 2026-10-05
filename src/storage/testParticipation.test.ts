import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageRepository, type SaveResult } from './repository';
import { emptyContext, emptyStore, type Problem, type Store } from '@/domain/types';
import { filterTestCandidates, isInTest } from '@/domain/quiz';
import { DEFAULT_SHARE_OPTIONS, extractSharePayload } from '@/domain/share';

const key = 'test-participation';
let repo: LocalStorageRepository;
beforeEach(() => { localStorage.clear(); repo = new LocalStorageRepository(key); });
afterEach(() => { repo.dispose(); vi.restoreAllMocks(); });
function problem(): Problem {
  return { id: 'problem', title: 'テスト対象', concealed: ['1m', '2m'], drawn: null, melds: [],
    doraIndicators: [], answerEnabled: true, acceptedDiscards: ['1m'], explanation: '', privateMemo: '',
    tagIds: [], context: emptyContext(), attachments: [], sourceUrl: '',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
}
function saved(result: SaveResult): Store {
  if (!result.ok) throw new Error(result.reason);
  return result.store;
}

describe('test participation in a single problem save', () => {
  it('defaults new problems on and saves an explicit off setting with the problem', () => {
    const first = saved(repo.saveProblem(emptyStore(), problem(), true));
    expect(first.study[0]?.inTest).toBe(true);
    const second = saved(repo.saveProblem(first, { ...problem(), id: 'off' }, true, false));
    expect(second.study.find((s) => s.problemId === 'off')?.inTest).toBe(false);
    expect(second.problems.map((p) => p.id)).toContain('off');
    expect(filterTestCandidates(second.problems, second.study, [], { filters: ['random'], tagIds: [] })
      .map((p) => p.id)).toEqual(['problem']);
  });

  it('retains study progress and content revision when changing only participation, with one write', () => {
    let store = saved(repo.saveProblem(emptyStore(), problem(), true));
    store.study[0] = { ...store.study[0]!, contentRevision: 3, confirmationCount: 4,
      understanding: 'understood', lastReviewedAt: '2026-02-01T00:00:00.000Z' };
    const before = structuredClone(store);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const changed = saved(repo.saveProblem(store, store.problems[0]!, false, false));
    expect(writes).toHaveBeenCalledTimes(1);
    expect(changed.revision).toBe(store.revision + 1);
    expect(changed.study[0]).toEqual({ ...store.study[0], inTest: false });
    expect(store).toEqual(before);
    expect(saved(repo.saveProblem(changed, changed.problems[0]!, false)).study[0]?.inTest).toBe(false);
  });

  it('bumps changed answer content once while saving the chosen participation state', () => {
    const store = saved(repo.saveProblem(emptyStore(), problem(), true));
    const changed = saved(repo.saveProblem(store, { ...store.problems[0]!, acceptedDiscards: ['2m'] }, false, false));
    expect(changed.study[0]).toMatchObject({ inTest: false, contentRevision: 1 });
  });

  it('handles legacy missing participation and missing study records when editing', () => {
    const store = emptyStore();
    store.problems.push(problem());
    const changed = saved(repo.saveProblem(store, problem(), false, false));
    expect(changed.study[0]).toMatchObject({ problemId: 'problem', inTest: false, contentRevision: 0 });
    const legacy = { ...changed, study: changed.study.map(({ inTest: _inTest, ...s }) => s) };
    expect(isInTest(legacy.study[0])).toBe(true);
    expect(saved(repo.saveProblem(legacy, problem(), false, false)).study[0]?.inTest).toBe(false);
  });

  it('does not partially save either the content or participation when storage fails', () => {
    const store = saved(repo.saveProblem(emptyStore(), problem(), true));
    const original = localStorage.getItem(key);
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const result = repo.saveProblem(store, { ...problem(), title: '未保存の編集' }, false, false);
    expect(result).toMatchObject({ ok: false, code: 'quota' });
    expect(writes).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(key)).toBe(original);
    expect(store.problems[0]?.title).toBe('テスト対象');
    expect(store.study[0]?.inTest).toBe(true);
  });

  it.each(['merge', 'replace'] as const)('preserves a personal off setting in backup export and %s import', (mode) => {
    const store = saved(repo.saveProblem(emptyStore(), problem(), true, false));
    const backup = repo.exportJson(store);
    const imported = saved(repo.importJson(store, backup, mode));
    expect(imported.study.every((s) => s.inTest === false)).toBe(true);
    expect(imported.problems).toHaveLength(mode === 'merge' ? 2 : 1);
  });

  it('resets a duplicate to new-problem participation without changing the original', () => {
    const store = saved(repo.saveProblem(emptyStore(), problem(), true, false));
    const duplicated = saved(repo.duplicateProblem(store, 'problem'));
    expect(duplicated.study.find((s) => s.problemId === 'problem')?.inTest).toBe(false);
    expect(duplicated.study.find((s) => s.problemId !== 'problem')?.inTest).toBe(true);
  });

  it('shares no personal participation setting and excludes an answerless received problem', () => {
    const payload = extractSharePayload(problem(), [], { ...DEFAULT_SHARE_OPTIONS, includeAnswerAndExplanation: false });
    expect(payload).not.toHaveProperty('inTest');
    expect(payload).not.toHaveProperty('study');
    const imported = saved(repo.addFromShare(emptyStore(), payload));
    expect(isInTest(imported.study[0])).toBe(true);
    expect(imported.problems[0]?.answerEnabled).toBe(false);
    expect(filterTestCandidates(imported.problems, imported.study, [], { filters: ['random'], tagIds: [] })).toEqual([]);
  });
});
