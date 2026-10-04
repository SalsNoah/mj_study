import { validateMeldShape } from './melds';
import { countRedsBySuit, isTileCode, tileLabel, tileRank, tileSortKey, tileSuit } from './tiles';
import type { Problem, TileCode } from './types';

export type AnalysisHand = Pick<Problem, 'concealed' | 'drawn' | 'melds' | 'doraIndicators'>;
export type EffectiveTile = { tile: TileCode; remaining: number; shanten: number };
export type Ukeire = {
  shanten: number;
  effective: EffectiveTile[];
  kinds: number;
  total: number;
};
export type DiscardUkeire = Ukeire & { discard: TileCode };
export type HandAnalysis =
  | { status: 'invalid' | 'partial'; reasons: string[] }
  | { status: 'ready'; currentShanten: number; mode: 'draw' | 'discard'; current: Ukeire | null; discards: DiscardUkeire[] };

const SUITS = ['m', 'p', 's', 'z'] as const;
export const NORMAL_TILES: TileCode[] = SUITS.flatMap((suit) =>
  Array.from({ length: suit === 'z' ? 7 : 9 }, (_, i) => `${i + 1}${suit}` as TileCode),
);
const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

export function tileIndex(tile: TileCode): number {
  return SUITS.indexOf(tileSuit(tile)) * 9 + tileRank(tile) - 1;
}

export function tileCounts(tiles: readonly TileCode[]): number[] {
  const counts = Array<number>(34).fill(0);
  for (const tile of tiles) counts[tileIndex(tile)]++;
  return counts;
}

// A profile gives the fewest missing tiles for every (meld count, pair count).
// Enumerate COMPLETE targets, not a greedy partition of the input. At each rank,
// a target consists of sequences begun here/at the preceding two ranks, an
// optional triplet and an optional pair. This covers every legal suit target,
// including overlapping sequences, while enforcing the four-copy limit.
// This is an original implementation; no external solver/code/table is bundled.
const profileCache = new Map<string, number[]>();
function suitProfile(hand: number[], fixed: number[], maxMelds: number, honors: boolean): number[] {
  const key = `${maxMelds}:${hand.join('')}:${fixed.join('')}`;
  const cached = profileCache.get(key);
  if (cached) return cached;
  let states = new Map<number, number>([[0, 0]]);
  for (let rank = 0; rank < hand.length; rank++) {
    const next = new Map<number, number>();
    for (const [state, cost] of states) {
      const older = state % 5;
      const previous = Math.floor(state / 5) % 5;
      const pair = Math.floor(state / 25) % 2;
      const melds = Math.floor(state / 50);
      for (let triplet = 0; triplet <= 1 && melds + triplet <= maxMelds; triplet++) {
        for (let head = 0; head <= 1 - pair; head++) {
          const maxStart = honors || rank >= 7 ? 0 : maxMelds - melds - triplet;
          for (let start = 0; start <= maxStart; start++) {
            const wanted = older + previous + start + triplet * 3 + head * 2;
            if (wanted + fixed[rank]! > 4) continue;
            const n = (melds + triplet + start) * 50 + (pair + head) * 25 + start * 5 + previous;
            const distance = cost + Math.max(0, wanted - hand[rank]!);
            if (distance < (next.get(n) ?? Infinity)) next.set(n, distance);
          }
        }
      }
    }
    states = next;
  }
  const result = Array<number>((maxMelds + 1) * 2).fill(Infinity);
  for (let melds = 0; melds <= maxMelds; melds++) {
    for (let pair = 0; pair <= 1; pair++) result[melds * 2 + pair] = states.get(melds * 50 + pair * 25) ?? Infinity;
  }
  // Bound cross-edit memory; callers never modify cached arrays.
  if (profileCache.size >= 4096) profileCache.clear();
  profileCache.set(key, result);
  return result;
}

/** Pure, structural shanten. Validated 13/14-equivalent input is supplied by analyzeHand.
 * Fixed melds stay fixed (including closed kans); dead outside tiles don't change shape.
 * 0 = ready shape, -1 = completed shape, irrespective of yaku or furiten.
 */
export function structuralShanten(counts: readonly number[], fixed: readonly number[] = Array<number>(34).fill(0), meldCount = 0): number {
  const needed = 4 - meldCount;
  let combined = Array<number>((needed + 1) * 2).fill(Infinity);
  combined[0] = 0;
  for (let suit = 0; suit < 4; suit++) {
    const start = suit * 9;
    const profile = suitProfile(counts.slice(start, start + 9), fixed.slice(start, start + 9), needed, suit === 3);
    const next = Array<number>(combined.length).fill(Infinity);
    for (let m = 0; m <= needed; m++) {
      for (let p = 0; p <= 1; p++) {
        for (let n = 0; n + m <= needed; n++) {
          for (let q = 0; q + p <= 1; q++) {
            const index = (m + n) * 2 + p + q;
            next[index] = Math.min(next[index]!, combined[m * 2 + p]! + profile[n * 2 + q]!);
          }
        }
      }
    }
    combined = next;
  }
  let shanten = combined[needed * 2 + 1]! - 1;
  if (meldCount === 0) {
    const pairs = counts.filter((n) => n >= 2).length;
    const kinds = counts.filter((n) => n > 0).length;
    const sevenPairs = 6 - pairs + Math.max(0, 7 - kinds);
    const orphanKinds = ORPHANS.filter((i) => counts[i]! > 0).length;
    const orphanPair = ORPHANS.some((i) => counts[i]! >= 2) ? 1 : 0;
    shanten = Math.min(shanten, sevenPairs, 13 - orphanKinds - orphanPair);
  }
  return shanten;
}

/** Read-only analysis from exactly the fields used by saved problems and the editor. */
export function analyzeHand(input: AnalysisHand): HandAnalysis {
  const hand = [...input.concealed, ...(input.drawn ? [input.drawn] : [])];
  const meldTiles = input.melds.flatMap((m) => m.tiles);
  const knownTiles = [...hand, ...meldTiles, ...input.doraIndicators];
  const reasons: string[] = [];
  if (knownTiles.some((tile) => !isTileCode(tile))) {
    return { status: 'invalid', reasons: ['不正な牌が含まれています。入力を確認してください。'] };
  }
  if (input.melds.length > 4) reasons.push('副露は4組までです。');
  if (input.doraIndicators.length > 5) reasons.push('ドラ表示牌は5枚までです。');
  for (const meld of input.melds) {
    const check = validateMeldShape(meld.type, meld.tiles, meld.from, meld.calledIndex, meld.addedIndex);
    if (!check.ok) reasons.push(check.reason);
  }
  const known = tileCounts(knownTiles);
  known.forEach((n, i) => {
    if (n > 4) reasons.push(`${tileLabel(NORMAL_TILES[i]!)}が赤・通常合わせて${n}枚あります（最大4枚）。`);
  });
  for (const [suit, n] of countRedsBySuit(knownTiles)) {
    if (n > 1) reasons.push(`${tileLabel(`0${suit}` as TileCode)}は現在の入力ルールでは1枚までです。`);
  }
  if (reasons.length) return { status: 'invalid', reasons: [...new Set(reasons)] };
  const equivalent = hand.length + input.melds.length * 3;
  if (equivalent !== 13 && equivalent !== 14) {
    return { status: 'partial', reasons: [`現在${equivalent}枚相当です。打牌別は14枚相当、現在の受け入れは13枚相当で表示します（槓も1組3枚相当）。`] };
  }
  const counts = tileCounts(hand);
  const fixed = tileCounts(meldTiles);
  const calculate = (c: readonly number[]) => structuralShanten(c, fixed, input.melds.length);
  const currentShanten = calculate(counts);
  const ukeire = (): Ukeire => {
    const shanten = calculate(counts);
    const effective: EffectiveTile[] = [];
    for (let i = 0; i < 34; i++) {
      if (counts[i]! + fixed[i]! >= 4) continue;
      counts[i]++;
      const after = calculate(counts);
      counts[i]--;
      if (after < shanten) effective.push({ tile: NORMAL_TILES[i]!, remaining: 4 - known[i]!, shanten: after });
    }
    const available = effective.filter((t) => t.remaining > 0);
    return { shanten, effective, kinds: available.length, total: available.reduce((n, tile) => n + tile.remaining, 0) };
  };
  if (equivalent === 13) return { status: 'ready', mode: 'draw', currentShanten, current: ukeire(), discards: [] };
  const discards: DiscardUkeire[] = [];
  const byIndex = new Map<number, Ukeire>();
  for (const discard of [...new Set(hand)].sort((a, b) => tileSortKey(a) - tileSortKey(b))) {
    const index = tileIndex(discard);
    let result = byIndex.get(index);
    if (!result) {
      counts[index]--;
      result = ukeire();
      counts[index]++;
      byIndex.set(index, result);
    }
    discards.push({ discard, ...result });
  }
  return { status: 'ready', mode: 'discard', currentShanten, current: null, discards };
}
