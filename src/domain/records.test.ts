import { describe, expect, it } from 'vitest';
import { badgeStatus, bumpDaily, dailyTotals, dayKey, normalizeStore, studyStreak } from './records';
import { filterTestCandidates, recentAccuracy, selectTestProblems } from './quiz';
import { emptyContext, emptyStore, type Attempt, type Problem, type StudyState } from './types';

function problem(id: string, tagIds: string[] = []): Problem {
  return {
    id,
    title: id,
    concealed: ['1m'],
    drawn: null,
    melds: [],
    doraIndicators: [],
    answerEnabled: true,
    acceptedDiscards: ['1m'],
    explanation: '',
    privateMemo: '',
    tagIds,
    context: emptyContext(),
    attachments: [],
    sourceUrl: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function study(problemId: string, extra: Partial<StudyState> = {}): StudyState {
  return {
    problemId,
    contentRevision: 0,
    confirmationCount: 0,
    lastConfirmedAt: null,
    understanding: 'unrated',
    lastReviewedAt: null,
    lastSolvedAt: null,
    lastCorrectAt: null,
    ...extra,
  };
}

function attempt(problemId: string, at: string, result: Attempt['result']): Attempt {
  return {
    id: `${problemId}-${at}`,
    problemId,
    contentRevision: 0,
    sessionId: 's',
    questionIndex: 0,
    at,
    selectedTile: '1m',
    result,
  };
}

describe('daily log', () => {
  it('bumps and totals per day', () => {
    let d = bumpDaily(undefined, '2026-09-25', 'tested', 1);
    d = bumpDaily(d, '2026-09-25', 'confirmed', 2);
    d = bumpDaily(d, '2026-09-24', 'tested', 3);
    expect(dailyTotals(d)).toEqual({ tested: 4, confirmed: 2, total: 6 });
  });

  it('never goes below zero', () => {
    const d = bumpDaily(undefined, '2026-09-25', 'confirmed', -1);
    expect(d['2026-09-25']?.confirmed).toBe(0);
  });

  it('counts consecutive study days', () => {
    const today = new Date(2026, 8, 25);
    const y1 = new Date(2026, 8, 24);
    const y3 = new Date(2026, 8, 22);
    const d = {
      [dayKey(today)]: { tested: 1, confirmed: 0 },
      [dayKey(y1)]: { tested: 0, confirmed: 1 },
      [dayKey(y3)]: { tested: 1, confirmed: 0 },
    };
    expect(studyStreak(d, today)).toBe(2);
  });
});

describe('normalizeStore', () => {
  it('backfills daily and last solved/correct dates from attempts', () => {
    const base = emptyStore();
    const store = normalizeStore({
      ...base,
      daily: undefined,
      problems: [problem('p1')],
      study: [{ ...study('p1'), lastSolvedAt: undefined, lastCorrectAt: undefined }],
      attempts: [
        attempt('p1', '2026-09-20T03:00:00.000Z', 'correct'),
        attempt('p1', '2026-09-21T03:00:00.000Z', 'incorrect'),
      ],
    });
    expect(store.study[0]?.lastSolvedAt).toBe('2026-09-21T03:00:00.000Z');
    expect(store.study[0]?.lastCorrectAt).toBe('2026-09-20T03:00:00.000Z');
    expect(dailyTotals(store.daily).tested).toBe(2);
  });
});

describe('badges', () => {
  it('evolves with cumulative total', () => {
    expect(badgeStatus(0).current.name).toBe('雀士見習い');
    expect(badgeStatus(10).current.name).toBe('初心者');
    const s = badgeStatus(20);
    expect(s.next?.name).toBe('初級者');
    expect(s.remaining).toBe(10);
  });
});

describe('test candidates', () => {
  const now = new Date('2026-09-25T00:00:00.000Z');
  const problems = [problem('low', ['t1']), problem('good'), problem('fresh'), problem('off')];
  const studies = [
    study('low', { lastSolvedAt: '2026-09-01T00:00:00.000Z' }),
    study('good', { lastSolvedAt: '2026-09-24T00:00:00.000Z' }),
    study('fresh'),
    study('off', { inTest: false }),
  ];
  const attempts = [
    attempt('low', '2026-09-01T00:00:00.000Z', 'incorrect'),
    attempt('low', '2026-08-31T00:00:00.000Z', 'incorrect'),
    attempt('low', '2026-08-30T00:00:00.000Z', 'correct'),
    attempt('good', '2026-09-24T00:00:00.000Z', 'correct'),
    attempt('good', '2026-09-23T00:00:00.000Z', 'correct'),
    attempt('good', '2026-09-22T00:00:00.000Z', 'correct'),
  ];
  const ids = (filters: Parameters<typeof filterTestCandidates>[3]['filters'], tagIds: string[] = []) =>
    filterTestCandidates(problems, studies, attempts, { filters, tagIds, now }).map((p) => p.id);

  it('random excludes only problems turned off', () => {
    expect(ids(['random'])).toEqual(['low', 'good', 'fresh']);
  });

  it('low accuracy uses recent answers at 70% or below', () => {
    expect(recentAccuracy(attempts, 'low', 0).rate).toBeCloseTo(1 / 3);
    expect(ids(['lowAccuracy'])).toEqual(['low']);
  });

  it('few answers means fewer than 3', () => {
    expect(ids(['fewAnswers'])).toEqual(['fresh']);
  });

  it('stale means 2 weeks or more, including never answered', () => {
    expect(ids(['stale'])).toEqual(['low', 'fresh']);
  });

  it('combines filters with AND', () => {
    expect(ids(['stale', 'tags'], ['t1'])).toEqual(['low']);
    expect(ids(['lowAccuracy', 'fewAnswers'])).toEqual([]);
  });

  it('caps the question count between 1 and 10', () => {
    const picked = selectTestProblems(problems, studies, attempts, {
      count: 2,
      filters: ['random'],
      tagIds: [],
      now,
    });
    expect(picked).toHaveLength(2);
    expect(picked.some((p) => p.id === 'off')).toBe(false);
  });
});
