import { describe, expect, it } from 'vitest';
import { parseHandNotation } from './parse';
import {
  DEFAULT_SEARCH_OPTIONS,
  matchProblemTiles,
  searchProblems,
  type SearchOptions,
} from './search';
import type { Problem, TileCode } from './types';
import { emptyContext } from './types';

function tiles(notation: string): TileCode[] {
  const r = parseHandNotation(notation);
  if (!r.ok) throw new Error(r.reason);
  return r.tiles;
}

function match(
  q: string,
  t: string,
  opts: Partial<SearchOptions> = {},
): boolean {
  return matchProblemTiles(tiles(q), tiles(t), {
    ...DEFAULT_SEARCH_OPTIONS,
    ...opts,
  }).matched;
}

function bareProblem(partial: Partial<Problem> & { id: string; concealed: TileCode[] }): Problem {
  return {
    title: '',
    drawn: null,
    melds: [],
    doraIndicators: [],
    answerEnabled: false,
    acceptedDiscards: [],
    explanation: '',
    privateMemo: '',
    tagIds: [],
    context: emptyContext(),
    attachments: [],
    sourceUrl: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('parseHandNotation', () => {
  it('parses basic and red', () => {
    expect(parseHandNotation('234m567p11z')).toMatchObject({ ok: true });
    expect(parseHandNotation('05p').ok && parseHandNotation('05p').ok && (parseHandNotation('05p') as { tiles: TileCode[] }).tiles).toEqual(['0p', '5p']);
  });

  it('rejects incomplete and invalid without silent drop', () => {
    expect(parseHandNotation('234').ok).toBe(false);
    expect(parseHandNotation('234x').ok).toBe(false);
    expect(parseHandNotation('0z').ok).toBe(false);
  });
});

describe('A11 search examples (spec §7)', () => {
  it('234m ↔ 234p (色替え)', () => {
    expect(match('234m', '234p')).toBe(true);
  });
  it('234m ↔ 678p (色替え+反転)', () => {
    expect(match('234m', '678p')).toBe(true);
  });
  it('11123m ↔ 78999s', () => {
    expect(match('11123m', '78999s')).toBe(true);
  });
  it('234m ↔ 345p (数字のずれ)', () => {
    expect(match('234m', '345p')).toBe(true);
  });
  it('11123m ↔ 22234p', () => {
    expect(match('11123m', '22234p')).toBe(true);
  });
  it('234m ↔ 356p 不一致', () => {
    expect(match('234m', '356p')).toBe(false);
  });
  it('11123m ↔ 77789s', () => {
    expect(match('11123m', '77789s')).toBe(true);
  });
  it('11123m ↔ 77799s 不一致', () => {
    expect(match('11123m', '77799s')).toBe(false);
  });
  it('11m ↔ 1p 枚数不足', () => {
    expect(match('11m', '1p')).toBe(false);
  });
  it('12m12p ↔ 1122s 色統合禁止', () => {
    expect(match('12m12p', '1122s')).toBe(false);
  });
  it('12m34p ↔ 89s34m 色別一括反転', () => {
    expect(match('12m34p', '89s34m')).toBe(true);
  });
  it('1z ↔ 2z 不一致', () => {
    expect(match('1z', '2z')).toBe(false);
  });
  it('5m ↔ 0p 赤同一視なら一致', () => {
    expect(match('5m', '0p', { distinguishRed: false })).toBe(true);
  });
  it('5m ↔ 0p 赤区別なら不一致', () => {
    expect(match('5m', '0p', { distinguishRed: true })).toBe(false);
  });
});

describe('A12 individual toggles', () => {
  it('all OFF: only exact tiles', () => {
    const off = { colorSwap: false, reverse: false, shift: false };
    expect(match('234m', '234m', off)).toBe(true);
    expect(match('234m', '234p', off)).toBe(false);
    expect(match('234m', '345m', off)).toBe(false);
    expect(match('234m', '678m', off)).toBe(false);
  });
  it('shift OFF: 234 vs 345 mismatch', () => {
    expect(match('234m', '345p', { shift: false })).toBe(false);
    expect(match('234m', '234p', { shift: false })).toBe(true);
  });
});

describe('A41 A42 A43', () => {
  it('11123m → 67888p (反転後-1)', () => {
    expect(match('11123m', '67888p')).toBe(true);
  });
  it('89m → 12p 一致、1256m→1267p 完全一致せず、循環なし', () => {
    expect(match('89m', '12p')).toBe(true);
    expect(match('1256m', '1267p')).toBe(false);
    // 9の次が1になる折り返しはしない（89→91 は平行移動不可）
    expect(match('89m', '91p', { reverse: false })).toBe(false);
    // 反転なら 9→1 は一致
    expect(match('9m', '1p', { colorSwap: true, reverse: true, shift: false })).toBe(true);
  });
  it('05m → 66p', () => {
    expect(match('05m', '66p', { distinguishRed: false })).toBe(true);
    expect(match('05m', '66p', { distinguishRed: true })).toBe(false);
  });
});

describe('A10 A14 A15 A16', () => {
  it('requires multiplicity', () => {
    expect(match('11m', '1m2m3m')).toBe(false);
    expect(match('11m', '11m2m')).toBe(true);
  });

  it('include melds toggle', () => {
    const problem = bareProblem({
      id: 'p1',
      concealed: tiles('1m'),
      melds: [
        {
          id: 'm1',
          type: 'pon',
          tiles: tiles('2p2p2p'),
          from: 'left',
          calledIndex: 0,
          addedIndex: null,
        },
      ],
    });
    const q = tiles('222p');
    expect(
      searchProblems([problem], q, { ...DEFAULT_SEARCH_OPTIONS, includeMelds: false }),
    ).toHaveLength(0);
    expect(
      searchProblems([problem], q, { ...DEFAULT_SEARCH_OPTIONS, includeMelds: true }),
    ).toHaveLength(1);
  });

  it('dora indicators never match alone', () => {
    const problem = bareProblem({
      id: 'p2',
      concealed: tiles('1m'),
      doraIndicators: tiles('234m'),
    });
    expect(
      searchProblems([problem], tiles('234m'), DEFAULT_SEARCH_OPTIONS),
    ).toHaveLength(0);
  });

  it('exact vs contains', () => {
    const target = tiles('123456m');
    expect(
      matchProblemTiles(tiles('123m'), target, {
        ...DEFAULT_SEARCH_OPTIONS,
        contains: true,
        colorSwap: false,
        reverse: false,
        shift: false,
      }).matched,
    ).toBe(true);
    expect(
      matchProblemTiles(tiles('123m'), target, {
        ...DEFAULT_SEARCH_OPTIONS,
        contains: false,
        colorSwap: false,
        reverse: false,
        shift: false,
      }).matched,
    ).toBe(false);
  });
});

describe('A44 search performance smoke', () => {
  it('500 problems without images under ~200ms', () => {
    const problems: Problem[] = [];
    for (let i = 0; i < 500; i++) {
      const suit = (['m', 'p', 's'] as const)[i % 3]!;
      const base = (i % 7) + 1;
      const notation = `${base}${base + 1}${base + 2}${suit}`;
      problems.push(
        bareProblem({
          id: `perf_${i}`,
          concealed: tiles(notation),
        }),
      );
    }
    const start = performance.now();
    const results = searchProblems(problems, tiles('234m'), DEFAULT_SEARCH_OPTIONS);
    const elapsed = performance.now() - start;
    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  });
});
