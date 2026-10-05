import { describe, expect, it } from 'vitest';
import { clampTestCount, filterTestCandidates, selectTestProblems, type TestFilter } from './quiz';
import { emptyContext, type Attempt, type Problem, type StudyState } from './types';

function problem(id: string, answerEnabled = true, tagIds = ['selected']): Problem {
  return {
    id, title: id, concealed: ['1m'], drawn: null, melds: [], doraIndicators: [],
    answerEnabled, acceptedDiscards: answerEnabled ? ['1m'] : [], explanation: '',
    privateMemo: '', tagIds, context: emptyContext(), attachments: [], sourceUrl: '',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
function study(problemId: string, inTest?: boolean): StudyState {
  return { problemId, inTest, contentRevision: 0, confirmationCount: 0, lastConfirmedAt: null,
    understanding: 'unrated', lastReviewedAt: null, lastSolvedAt: null };
}

describe('mandatory test eligibility', () => {
  const problems = [problem('on'), problem('legacy'), problem('missing-study'), problem('off'), problem('no-answer', false), problem('other-tag', true, ['other'])];
  const studies = [study('on', true), study('legacy'), study('off', false), study('no-answer', true)];
  const attempts: Attempt[] = problems.map((p) => ({ id: `attempt-${p.id}`, problemId: p.id,
    contentRevision: 0, sessionId: 'session', questionIndex: 0, at: '2026-01-01T00:00:00.000Z',
    selectedTile: '1m', result: 'incorrect' }));

  it.each([undefined, false, true])('excludes answerless and opted-out problems even with legacy answerOnly=%s', (answerOnly) => {
    const options = { filters: ['random'] as TestFilter[], tagIds: [], answerOnly };
    expect(filterTestCandidates(problems, studies, attempts, options).map((p) => p.id))
      .toEqual(['on', 'legacy', 'missing-study', 'other-tag']);
    expect(selectTestProblems(problems, studies, attempts, { ...options, count: 99 }, () => 0)
      .every((p) => p.answerEnabled && p.id !== 'off')).toBe(true);
  });

  it.each<TestFilter[]>([['random'], ['lowAccuracy'], ['fewAnswers'], ['stale'], ['tags'], ['lowAccuracy', 'fewAnswers', 'stale', 'tags']])
    ('keeps the mandatory eligibility AND selected conditions for %j', (...filters) => {
      const candidates = filterTestCandidates(problems, studies, attempts, {
        filters, tagIds: ['selected'], answerOnly: false, now: new Date('2026-10-01T00:00:00.000Z'),
      });
      expect(candidates.map((p) => p.id)).toEqual(filters.includes('tags')
        ? ['on', 'legacy', 'missing-study'] : ['on', 'legacy', 'missing-study', 'other-tag']);
    });

  it('allows a session above the old 10-question cap, bounded by eligible candidates', () => {
    const many = Array.from({ length: 14 }, (_, index) => problem(`p-${index}`));
    const selected = selectTestProblems(many, [], [], { count: 13, filters: ['random'], tagIds: [] }, () => 0);
    expect(selected).toHaveLength(13);
    expect(new Set(selected.map((p) => p.id)).size).toBe(13);
    expect(selectTestProblems(many, [], [], { count: 99, filters: ['random'], tagIds: [] })).toHaveLength(14);
  });

  it('has no candidates and no questions when all stored problems are answerless or excluded', () => {
    expect(selectTestProblems([problem('no-answer', false), problem('off')], [study('off', false)], [],
      { count: 5, filters: ['random'], tagIds: [], answerOnly: false })).toEqual([]);
    expect(clampTestCount(5, 0)).toBe(0);
    expect(clampTestCount(5, 2)).toBe(2);
    expect(clampTestCount(0, 2)).toBe(1);
  });
});
