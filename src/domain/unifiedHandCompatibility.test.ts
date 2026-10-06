import { beforeEach, expect, it } from 'vitest';
import { parseHandNotation } from './parse';
import { emptyContext, emptyStore, type Problem, type TileCode } from './types';
import { analyzeHand, tileCounts } from './ukeire';
import { remainingLimits } from './remaining';
import { standardTileCount, validateProblem } from './validate';
import { judgeDiscard } from './quiz';
import { LocalStorageRepository } from '@/storage/repository';

const tiles = (notation: string) => {
  const parsed = parseHandNotation(notation);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.tiles;
};

function legacyProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: 'legacy-hand', title: '既存の問題', concealed: tiles('123m123p123s45s77z'), drawn: '0s',
    melds: [], doraIndicators: ['5s'], answerEnabled: true, acceptedDiscards: ['0s'],
    explanation: '赤五索を選ぶ', privateMemo: '保存されたメモ', tagIds: [], context: emptyContext(),
    attachments: [], sourceUrl: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const unified = (problem: Problem): Problem => ({
  ...problem, concealed: [...problem.concealed, ...(problem.drawn ? [problem.drawn] : [])], drawn: null,
});

beforeEach(() => localStorage.clear());

it.each(['merge', 'replace'] as const)('retains the original split and accepted red tile through legacy JSON %s and export', (mode) => {
  const original = legacyProblem();
  const backup = { ...emptyStore(), problems: [original] };
  const repo = new LocalStorageRepository('unified-hand-test');
  const imported = repo.importJson(emptyStore(), JSON.stringify(backup), mode);
  expect(imported.ok).toBe(true);
  if (!imported.ok) throw new Error(imported.reason);
  const exported = JSON.parse(repo.exportJson(imported.store));
  expect(exported.problems[0]).toMatchObject({
    concealed: original.concealed, drawn: '0s', acceptedDiscards: ['0s'], privateMemo: original.privateMemo,
  });
  const reloaded = repo.load();
  expect(reloaded.ok).toBe(true);
  if (!reloaded.ok) throw new Error(reloaded.reason);
  expect(reloaded.store.problems[0]!.concealed).toEqual(original.concealed);
  expect(reloaded.store.problems[0]!.drawn).toBe('0s');
  repo.dispose();
});

it('validates accepted red tiles consistently for existing split and unified hands', () => {
  const original = legacyProblem();
  expect(validateProblem(original)).toEqual(validateProblem(unified(original)));
  expect(judgeDiscard(original.drawn!, original.acceptedDiscards)).toBe('correct');
  expect(judgeDiscard('5s', original.acceptedDiscards)).toBe('incorrect');
});

it.each([false, true])('preserves 14-equivalent count, known tiles, remaining limits and complete analysis (meld=%s)', (withMeld) => {
  const original = legacyProblem(withMeld ? {
    concealed: tiles('23m456p789s55z'), drawn: '1z', acceptedDiscards: ['1z'], doraIndicators: ['4m', '0p'],
    melds: [{ id: 'kan', type: 'closedKan', tiles: ['1m', '1m', '1m', '1m'], from: null, calledIndex: null, addedIndex: null }],
  } : {});
  const merged = unified(original);
  const snapshot = structuredClone(original);
  const allKnown = (problem: Problem): TileCode[] => [
    ...problem.concealed, ...(problem.drawn ? [problem.drawn] : []),
    ...problem.melds.flatMap((meld) => meld.tiles), ...problem.doraIndicators,
  ];
  expect(standardTileCount(original)).toBe(14);
  expect(standardTileCount(merged)).toBe(14);
  expect(tileCounts(allKnown(original))).toEqual(tileCounts(allKnown(merged)));
  expect(remainingLimits(original)).toEqual(remainingLimits(merged));
  const analysis = analyzeHand(original);
  expect(analysis.status).toBe('ready');
  expect(analyzeHand(merged)).toEqual(analysis);
  expect(validateProblem(merged)).toEqual(validateProblem(original));
  expect(original).toEqual(snapshot);
});

it('retains four-copy and red-duplicate errors instead of sanitizing legacy data', () => {
  for (const original of [
    legacyProblem({ concealed: ['5m', '5m', '5m'], drawn: '0m', doraIndicators: ['5m'], acceptedDiscards: ['0m'] }),
    legacyProblem({ concealed: ['0m'], drawn: '0m', doraIndicators: [], acceptedDiscards: ['0m'] }),
  ]) {
    const errors = validateProblem(original).filter((issue) => issue.level === 'error');
    expect(errors.some((issue) => issue.code === 'tile_over5' || issue.code === 'red_dup')).toBe(true);
    expect(validateProblem(unified(original)).filter((issue) => issue.level === 'error')).toEqual(errors);
    expect(analyzeHand(original).status).toBe('invalid');
    expect(analyzeHand(unified(original))).toEqual(analyzeHand(original));
  }
});
