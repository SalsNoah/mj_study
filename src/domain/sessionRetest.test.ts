import { describe, expect, it } from 'vitest';
import { filterTestCandidates, type TestFilter } from './quiz';
import { sessionRetestCandidates, snapshotSessionQuestions, type SessionResults } from './sessionRetest';
import { emptyContext, type Attempt, type Problem, type StudyState } from './types';

function problem(id: string): Problem {
  return { id, title: id, concealed: ['1m', '2m'], drawn: null, melds: [], doraIndicators: [],
    answerEnabled: true, acceptedDiscards: ['1m'], explanation: '', privateMemo: '', tagIds: [],
    context: emptyContext(), attachments: [], sourceUrl: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
}
function state(problemId: string): StudyState {
  return { problemId, contentRevision: 0, confirmationCount: 0, lastConfirmedAt: null, lastReviewedAt: null, understanding: 'unrated' };
}
function result(problemId: string, questionIndex: number, result: Attempt['result'] = 'incorrect', understanding: StudyState['understanding'] = 'unrated') {
  return { attempt: { id: `answer-${problemId}`, problemId, contentRevision: 0, sessionId: 'current', questionIndex,
    at: '2026-10-06T00:00:00Z', selectedTile: '1m' as const, result }, understanding };
}

describe('retesting the completed portion of this session', () => {
  it('takes the deduplicated union of incorrect and final uncertain, excluding unattempted questions and global ratings', () => {
    const problems = ['wrong', 'uncertain', 'overlap', 'understood', 'unanswered'].map(problem);
    const study = problems.map((p) => ({ ...state(p.id), understanding: 'uncertain' as const }));
    const results = { wrong: result('wrong', 0, 'incorrect', 'understood'), uncertain: result('uncertain', 1, 'correct', 'uncertain'),
      overlap: result('overlap', 2, 'incorrect', 'uncertain'), understood: result('understood', 3, 'correct', 'understood') };
    const selected = sessionRetestCandidates('current', snapshotSessionQuestions(problems, study), results, problems, study);
    expect(selected.problems.map((p) => p.id)).toEqual(['wrong', 'uncertain', 'overlap']);
    expect(selected.excludedCount).toBe(0);
    results.uncertain.understanding = 'understood';
    expect(sessionRetestCandidates('current', snapshotSessionQuestions(problems, study), results, problems, study).problems.map((p) => p.id))
      .toEqual(['wrong', 'overlap']);
  });

  it('requires the current session and its exact question/revision cohort, never foreign or unanswered queue items', () => {
    const problems = ['a', 'b', 'outside'].map(problem);
    const cohort = snapshotSessionQuestions(problems.slice(0, 2), []);
    const wrongSession = result('a', 0);
    wrongSession.attempt.sessionId = 'previous';
    const wrongRevision = result('a', 0);
    wrongRevision.attempt.contentRevision = 1;
    const results = { previous: wrongSession, edited: wrongRevision, outside: result('outside', 2), wrongIndex: result('b', 0) };
    expect(sessionRetestCandidates('current', cohort, results, problems, []).problems).toEqual([]);
    expect(sessionRetestCandidates('current', cohort, {}, problems, []).excludedCount).toBe(0);
  });

  it('resolves current problems, removes deleted, disabled, answerless and revised entries, and gives the actual eligible count', () => {
    const original = ['keep', 'missing', 'off', 'answerless', 'edited'].map(problem);
    const cohort = snapshotSessionQuestions(original, []);
    const results = Object.fromEntries(original.map((p, i) => [p.id, result(p.id, i)]));
    const current = original.filter((p) => p.id !== 'missing').map((p) => ({ ...p,
      title: `${p.title} current`, answerEnabled: p.id !== 'answerless' }));
    const study = [{ ...state('off'), inTest: false }, { ...state('edited'), contentRevision: 1 }];
    const selected = sessionRetestCandidates('current', cohort, results, current, study);
    expect(selected.problems).toEqual([current[0]]);
    expect(selected.problems[0]!.title).toBe('keep current');
    expect(selected.excludedCount).toBe(4);
    expect(sessionRetestCandidates('current', cohort, results, [], []).excludedCount).toBe(5);
  });

  it.each<TestFilter>(['stale', 'fewAnswers', 'lowAccuracy'])('keeps the frozen %s cohort when answering changes filter eligibility', (filter) => {
    const problems = [problem('a')];
    const study = [state('a')];
    const previous: Attempt[] = [0, 1].map((i) => ({ ...result('a', i, i === 0 ? 'correct' : 'incorrect').attempt, id: `old-${i}` }));
    const options = { filters: [filter], tagIds: [], now: new Date('2026-10-06T00:00:00Z') };
    const cohort = snapshotSessionQuestions(filterTestCandidates(problems, study, previous, options), study);
    expect(cohort).toHaveLength(1);
    const completed = result('a', 0, 'correct', 'uncertain');
    const recent = [...previous, completed.attempt];
    // lowAccuracy crosses its 70% threshold after enough current-session history.
    if (filter === 'lowAccuracy') recent.push({ ...completed.attempt, id: 'more', at: '2026-10-06T01:00:00Z' });
    study[0]!.lastSolvedAt = options.now.toISOString();
    expect(filterTestCandidates(problems, study, recent, options)).toEqual([]);
    expect(sessionRetestCandidates('current', cohort, { a: completed }, problems, study).problems).toEqual(problems);
  });

  it('uses each new retest session independently and does not mutate stored data', () => {
    const problems = ['a', 'b'].map(problem);
    const cohort = snapshotSessionQuestions(problems, []);
    const results: SessionResults = { a: result('a', 0), b: result('b', 1) };
    const before = JSON.stringify({ problems, cohort, results });
    expect(sessionRetestCandidates('current', cohort, results, problems, []).problems).toHaveLength(2);
    const next = result('a', 0, 'correct');
    next.attempt.sessionId = 'next';
    expect(sessionRetestCandidates('next', snapshotSessionQuestions(problems, []), { a: next, b: results.b! }, problems, []).problems).toEqual([]);
    expect(JSON.stringify({ problems, cohort, results })).toBe(before);
  });
});
