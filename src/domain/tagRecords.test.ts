import { describe, expect, it } from 'vitest';
import { buildTagRecords } from './tagRecords';
import { emptyContext, emptyStore, type Attempt, type Problem, type StudyState } from './types';

function problem(id: string, tagIds: string[] = ['shape']): Problem {
  return { id, title: id, concealed: ['1m'], drawn: null, melds: [], doraIndicators: [],
    answerEnabled: true, acceptedDiscards: ['1m'], explanation: '', privateMemo: '', tagIds,
    context: emptyContext(), attachments: [], sourceUrl: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
}
function study(problemId: string, understanding: StudyState['understanding'] = 'unrated', contentRevision = 0): StudyState {
  return { problemId, understanding, contentRevision, confirmationCount: 0, lastConfirmedAt: null, lastReviewedAt: null };
}
function answer(problemId: string, index: number, result: Attempt['result'] = 'correct', contentRevision = 0): Attempt {
  return { id: `${problemId}-${index}`, problemId, contentRevision, sessionId: 'session', questionIndex: index,
    result, selectedTile: '1m', at: '2026-10-06T00:00:00Z' };
}
function fixture() {
  return { ...emptyStore(), tags: [{ id: 'shape', name: '牌効率' }], problems: [problem('a'), problem('b')] };
}

describe('current tag records', () => {
  it('weights actual answers: 9/10 and 0/1 are 9/11, not an average of problem percentages', () => {
    const store = fixture();
    store.attempts = [...Array.from({ length: 10 }, (_, i) => answer('a', i, i < 9 ? 'correct' : 'incorrect')), answer('b', 0, 'incorrect')];
    expect(buildTagRecords(store)[0]).toMatchObject({ correct: 9, answered: 11, accuracy: 9 / 11, problemCount: 2 });
  });

  it('has unknown accuracy for no answers, old revisions, self review and unrecognized results', () => {
    const store = fixture();
    store.study = [study('a', 'uncertain', 2), study('b', 'understood', 1)];
    store.attempts = [answer('a', 0, 'correct', 1), answer('a', 1, 'selfReview', 2), answer('b', 0, 'incorrect'),
      { ...answer('b', 1, 'correct', 1), result: 'unknown' as Attempt['result'] }];
    expect(buildTagRecords(store)[0]).toMatchObject({ correct: 0, answered: 0, accuracy: null, understood: 1, uncertain: 1, unrated: 0 });
    store.attempts = [];
    expect(buildTagRecords(store)[0]!.accuracy).toBeNull();
  });

  it('uses current tag names and memberships after rename, reassignment and removal', () => {
    const store = fixture();
    store.tags.push({ id: 'defense', name: '守備' });
    store.attempts = [answer('a', 0), answer('b', 0, 'incorrect')];
    store.tags[0]!.name = '形';
    store.problems[0]!.tagIds = ['defense'];
    expect(buildTagRecords(store).map(({ name, correct, answered }) => ({ name, correct, answered }))).toEqual([
      { name: '形', correct: 0, answered: 1 }, { name: '守備', correct: 1, answered: 1 },
    ]);
    store.tags = store.tags.filter((tag) => tag.id !== 'shape');
    store.problems[1]!.tagIds = [];
    expect(buildTagRecords(store).map(({ name, answered }) => ({ name, answered }))).toEqual([
      { name: '守備', answered: 1 }, { name: 'タグなし', answered: 1 },
    ]);
  });

  it('counts multi-tag membership once per tag and distinguishes unresolved tags from tagless problems', () => {
    const store = fixture();
    store.tags.push({ id: 'defense', name: '守備' });
    store.problems = [problem('a', ['shape', 'shape', 'defense', 'missing', 'also-missing']), problem('b', [])];
    store.study = [study('a', 'understood'), study('b', 'uncertain')];
    store.attempts = [answer('a', 0), answer('b', 0, 'incorrect')];
    const rows = buildTagRecords(store);
    expect(rows.map(({ name, problemCount, correct, answered }) => ({ name, problemCount, correct, answered }))).toEqual([
      { name: '牌効率', problemCount: 1, correct: 1, answered: 1 },
      { name: '守備', problemCount: 1, correct: 1, answered: 1 },
      { name: 'タグなし', problemCount: 1, correct: 0, answered: 1 },
      { name: '不明なタグ', problemCount: 1, correct: 1, answered: 1 },
    ]);
    expect(rows[3]!.understood).toBe(1);
  });

  it('keeps eligible history when inTest is off and includes answerless notes and missing study as current problem counts', () => {
    const store = fixture();
    store.problems[1]!.answerEnabled = false;
    store.problems[1]!.acceptedDiscards = [];
    store.problems.push(problem('missing-study'));
    store.study = [{ ...study('a', 'uncertain'), inTest: false }, study('b', 'understood')];
    store.attempts = [answer('a', 0), answer('missing-study', 0, 'incorrect')];
    expect(buildTagRecords(store)[0]).toMatchObject({ problemCount: 3, correct: 1, answered: 2, accuracy: 0.5,
      understood: 1, uncertain: 1, unrated: 1 });
  });

  it('never assigns deleted, sample-detached or other orphan history to a guessed tag', () => {
    const store = fixture();
    store.study = [study('deleted', 'understood'), study('sample-archive', 'uncertain')];
    store.attempts = [answer('deleted', 0), answer('sample-archive', 0, 'incorrect'), answer('orphan', 0)];
    expect(buildTagRecords(store)).toEqual([{ key: 'tag:shape', name: '牌効率', problemCount: 2,
      correct: 0, answered: 0, accuracy: null, understood: 0, uncertain: 0, unrated: 2 }]);
  });

  it('is read-only and leaves daily, material, sample and backup-compatible data unchanged', () => {
    const store = fixture();
    store.attempts = [answer('a', 0)];
    store.daily = { '2026-10-06': { tested: 100, confirmed: 200 } };
    store.materials = [{ id: 'm', title: '教材', url: 'https://example.com/', comment: '', createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z' }];
    store.materialStudyEvents = [{ id: 'm', materialId: 'm', at: '2026-10-06T00:00:00Z', title: '教材', url: 'https://example.com/', comment: '' }];
    store.sampleCatalogUpdates = [{ id: 'backup', snapshotDigest: 'digest', createdAt: '2026-10-06T00:00:00Z', restoredAt: null }];
    const before = JSON.stringify(store);
    function freeze(value: object) {
      for (const entry of Object.values(value)) if (entry && typeof entry === 'object') freeze(entry);
      Object.freeze(value);
    }
    freeze(store);
    expect(buildTagRecords(store)[0]).toMatchObject({ correct: 1, answered: 1 });
    expect(JSON.stringify(store)).toBe(before);
    expect(buildTagRecords(JSON.parse(before))).toEqual(buildTagRecords(store));
    expect(buildTagRecords(emptyStore())).toEqual([]);
  });
});
