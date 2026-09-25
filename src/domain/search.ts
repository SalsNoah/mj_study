import { flattenMeldTiles } from './melds';
import {
  isHonor,
  isNumberTile,
  isRed,
  normalizeRedAsFive,
  tileRank,
  tileSuit,
} from './tiles';
import type { Meld, Problem, TileCode } from './types';

export type SearchOptions = {
  /** 指定した牌を含む（false なら完全一致） */
  contains: boolean;
  colorSwap: boolean;
  reverse: boolean;
  shift: boolean;
  distinguishRed: boolean;
  includeMelds: boolean;
};

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  contains: true,
  colorSwap: true,
  reverse: true,
  shift: true,
  distinguishRed: false,
  includeMelds: false,
};

export type MatchReason =
  | 'そのまま'
  | '色替え'
  | '反転'
  | '数字のずれ';

export type SearchMatch = {
  problemId: string;
  reasons: MatchReason[];
};

type SuitMap = Record<'m' | 'p' | 's', 'm' | 'p' | 's'>;

const IDENTITY_MAP: SuitMap = { m: 'm', p: 'p', s: 's' };

function allColorMaps(enabled: boolean): SuitMap[] {
  if (!enabled) return [IDENTITY_MAP];
  const suits: Array<'m' | 'p' | 's'> = ['m', 'p', 's'];
  const maps: SuitMap[] = [];
  for (const m of suits) {
    for (const p of suits) {
      if (p === m) continue;
      for (const s of suits) {
        if (s === m || s === p) continue;
        maps.push({ m, p, s });
      }
    }
  }
  return maps;
}

function isIdentityMap(map: SuitMap): boolean {
  return map.m === 'm' && map.p === 'p' && map.s === 's';
}

/** 牌を検索比較用キーへ。distinguishRed=false なら赤→5。 */
function toKey(code: TileCode, distinguishRed: boolean): string {
  if (!distinguishRed && isRed(code)) {
    return normalizeRedAsFive(code);
  }
  return code;
}

function multisetFrom(tiles: readonly TileCode[], distinguishRed: boolean): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of tiles) {
    const k = toKey(t, distinguishRed);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

function isSubset(query: Map<string, number>, target: Map<string, number>): boolean {
  for (const [k, n] of query) {
    if ((target.get(k) ?? 0) < n) return false;
  }
  return true;
}

function isExact(query: Map<string, number>, target: Map<string, number>): boolean {
  if (query.size !== target.size) return false;
  for (const [k, n] of query) {
    if (target.get(k) !== n) return false;
  }
  return true;
}

function collectTargetTiles(problem: Problem, includeMelds: boolean): TileCode[] {
  const tiles: TileCode[] = [...problem.concealed];
  if (problem.drawn) tiles.push(problem.drawn);
  if (includeMelds) {
    for (const meld of problem.melds) {
      tiles.push(...flattenMeldTiles(meld));
    }
  }
  return tiles;
}

type NumberTile = { rank: number; suit: 'm' | 'p' | 's'; red: boolean };

function toNumberTile(code: TileCode): NumberTile | null {
  if (!isNumberTile(code)) return null;
  return {
    rank: tileRank(code),
    suit: tileSuit(code) as 'm' | 'p' | 's',
    red: isRed(code),
  };
}

function fromNumberTile(t: NumberTile, distinguishRed: boolean): string {
  if (distinguishRed && t.red) {
    // 赤は常にランク5のみ有効
    return `0${t.suit}`;
  }
  if (t.red && !distinguishRed) {
    return `${t.rank}${t.suit}`;
  }
  return `${t.rank}${t.suit}`;
}

/**
 * クエリ数牌に色替え・反転・ずれを適用した候補キー多重集合を列挙。
 * 字牌は変換せず呼び出し側で結合する。
 */
function transformNumberQuery(
  numbers: NumberTile[],
  options: SearchOptions,
): Array<{ keys: Map<string, number>; colorChanged: boolean; reversed: boolean; shifted: boolean }> {
  const results: Array<{
    keys: Map<string, number>;
    colorChanged: boolean;
    reversed: boolean;
    shifted: boolean;
  }> = [];
  const seen = new Set<string>();

  const maps = allColorMaps(options.colorSwap);
  const reverseModes = options.reverse
    ? ([
        [false, false, false],
        [true, false, false],
        [false, true, false],
        [false, false, true],
        [true, true, false],
        [true, false, true],
        [false, true, true],
        [true, true, true],
      ] as boolean[][])
    : [[false, false, false]];

  for (const map of maps) {
    // 色替え後の牌
    const remapped: NumberTile[] = numbers.map((t) => ({
      rank: t.rank,
      suit: map[t.suit],
      red: t.red,
    }));

    for (const rev of reverseModes) {
      const revBySuit: Record<'m' | 'p' | 's', boolean> = {
        m: rev[0]!,
        p: rev[1]!,
        s: rev[2]!,
      };

      // 各色の牌を集め、反転適用
      const bySuit: Record<'m' | 'p' | 's', NumberTile[]> = { m: [], p: [], s: [] };
      let invalid = false;
      for (const t of remapped) {
        const rank = revBySuit[t.suit] ? 10 - t.rank : t.rank;
        if (rank < 1 || rank > 9) {
          invalid = true;
          break;
        }
        // 赤区別時、反転で5以外になったらこの反転組合せは棄却
        if (options.distinguishRed && t.red && rank !== 5) {
          invalid = true;
          break;
        }
        bySuit[t.suit].push({ rank, suit: t.suit, red: t.red });
      }
      if (invalid) continue;

      // 色ごとに有効な d を列挙
      const shiftOptions = options.shift;
      const ds: Record<'m' | 'p' | 's', number[]> = { m: [0], p: [0], s: [0] };
      for (const suit of ['m', 'p', 's'] as const) {
        const group = bySuit[suit];
        if (group.length === 0) {
          ds[suit] = [0];
          continue;
        }
        if (!shiftOptions) {
          ds[suit] = [0];
          continue;
        }
        const ranks = group.map((t) => t.rank);
        const minR = Math.min(...ranks);
        const maxR = Math.max(...ranks);
        const valid: number[] = [];
        for (let d = 1 - minR; d <= 9 - maxR; d++) {
          // 赤区別時: ずらした後の赤が5以外なら棄却
          if (options.distinguishRed) {
            const ok = group.every((t) => !t.red || t.rank + d === 5);
            if (!ok) continue;
          }
          valid.push(d);
        }
        if (valid.length === 0) {
          invalid = true;
          break;
        }
        ds[suit] = valid;
      }
      if (invalid) continue;

      // 直積を抑えめに：色ごとの d を組み合わせ
      for (const dm of ds.m) {
        for (const dp of ds.p) {
          for (const dsuit of ds.s) {
            const dMap = { m: dm, p: dp, s: dsuit };
            const keys = new Map<string, number>();
            let ok = true;
            for (const suit of ['m', 'p', 's'] as const) {
              for (const t of bySuit[suit]) {
                const rank = t.rank + dMap[suit];
                if (rank < 1 || rank > 9) {
                  ok = false;
                  break;
                }
                if (options.distinguishRed && t.red && rank !== 5) {
                  ok = false;
                  break;
                }
                const key = fromNumberTile(
                  { rank, suit, red: t.red },
                  options.distinguishRed,
                );
                keys.set(key, (keys.get(key) ?? 0) + 1);
              }
              if (!ok) break;
            }
            if (!ok) continue;

            const sig = [...keys.entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([k, n]) => `${k}:${n}`)
              .join(',');
            if (seen.has(sig)) continue;
            seen.add(sig);

            const colorChanged = !isIdentityMap(map);
            const reversed = rev.some(Boolean);
            const shifted = dm !== 0 || dp !== 0 || dsuit !== 0;
            results.push({ keys, colorChanged, reversed, shifted });
          }
        }
      }
    }
  }

  return results;
}

function reasonsFromFlags(
  colorChanged: boolean,
  reversed: boolean,
  shifted: boolean,
): MatchReason[] {
  if (!colorChanged && !reversed && !shifted) return ['そのまま'];
  const reasons: MatchReason[] = [];
  if (colorChanged) reasons.push('色替え');
  if (reversed) reasons.push('反転');
  if (shifted) reasons.push('数字のずれ');
  return reasons;
}

function reasonScore(reasons: MatchReason[]): number {
  if (reasons.length === 1 && reasons[0] === 'そのまま') return 0;
  return reasons.length;
}

export function matchProblemTiles(
  queryTiles: readonly TileCode[],
  targetTiles: readonly TileCode[],
  options: SearchOptions,
): { matched: boolean; reasons: MatchReason[] } {
  if (queryTiles.length === 0) {
    return { matched: false, reasons: [] };
  }

  const queryHonors = queryTiles.filter(isHonor);
  const queryNumbers = queryTiles
    .map(toNumberTile)
    .filter((t): t is NumberTile => t !== null);

  const honorQuery = multisetFrom(queryHonors, options.distinguishRed);
  const target = multisetFrom(targetTiles, options.distinguishRed);

  // 字牌は変換しない — 先に必要枚数を満たすか確認
  if (!isSubset(honorQuery, target)) {
    return { matched: false, reasons: [] };
  }

  // 数牌が空なら字牌だけで判定
  if (queryNumbers.length === 0) {
    const q = honorQuery;
    const matched = options.contains ? isSubset(q, target) : isExact(q, target);
    // 完全一致時は字牌クエリがターゲット全体と一致する必要
    if (!options.contains) {
      // ターゲットから字牌以外も含めて exact
      const fullQuery = new Map(honorQuery);
      const matchedExact = isExact(fullQuery, target);
      return matchedExact
        ? { matched: true, reasons: ['そのまま'] }
        : { matched: false, reasons: [] };
    }
    return matched
      ? { matched: true, reasons: ['そのまま'] }
      : { matched: false, reasons: [] };
  }

  const candidates = transformNumberQuery(queryNumbers, options);
  let best: MatchReason[] | null = null;

  for (const cand of candidates) {
    const full = new Map(cand.keys);
    for (const [k, n] of honorQuery) {
      full.set(k, (full.get(k) ?? 0) + n);
    }

    const ok = options.contains ? isSubset(full, target) : isExact(full, target);
    if (!ok) continue;

    const reasons = reasonsFromFlags(cand.colorChanged, cand.reversed, cand.shifted);
    if (!best || reasonScore(reasons) < reasonScore(best)) {
      best = reasons;
      if (reasonScore(best) === 0) break;
    }
  }

  if (!best) return { matched: false, reasons: [] };
  return { matched: true, reasons: best };
}

export function searchProblems(
  problems: readonly Problem[],
  queryTiles: readonly TileCode[],
  options: SearchOptions,
): SearchMatch[] {
  if (queryTiles.length === 0) return [];
  const out: SearchMatch[] = [];
  const seen = new Set<string>();

  for (const problem of problems) {
    if (seen.has(problem.id)) continue;
    const target = collectTargetTiles(problem, options.includeMelds);
    const result = matchProblemTiles(queryTiles, target, options);
    if (result.matched) {
      seen.add(problem.id);
      out.push({ problemId: problem.id, reasons: result.reasons });
    }
  }
  return out;
}

/** テスト用ヘルパー：表記同士の一致 */
export function tilesMatchNotation(
  query: readonly TileCode[],
  target: readonly TileCode[],
  options: Partial<SearchOptions> = {},
): boolean {
  return matchProblemTiles(query, target, {
    ...DEFAULT_SEARCH_OPTIONS,
    ...options,
  }).matched;
}

export function meldsToTiles(melds: readonly Meld[]): TileCode[] {
  return melds.flatMap(flattenMeldTiles);
}
