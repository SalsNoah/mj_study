import { NORMAL_TILES, tileCounts, type AnalysisHand, type Ukeire } from './ukeire';
import type { TileCode } from './types';

export type RemainingOverrides = Partial<Record<TileCode, number>>;

/** Validated analysis input only. Discarding moves a known tile, so limits are
 * calculated once from the entire current input, not from each post-discard hand. */
export function remainingLimits(input: AnalysisHand): number[] {
  const known = tileCounts([
    ...input.concealed, ...(input.drawn ? [input.drawn] : []),
    ...input.melds.flatMap((meld) => meld.tiles), ...input.doraIndicators,
  ]);
  return known.map((count) => 4 - count);
}

export function parseRemainingInput(text: string, upper: number): { ok: true; value: number } | { ok: false; reason: string } {
  if (!/^\d+$/.test(text)) return { ok: false, reason: `0〜${upper}の整数を入力してください。` };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > upper) return { ok: false, reason: `自動上限${upper}枚を超える値は設定できません。` };
  return { ok: true, value };
}

/** Apply the same remaining supply to every discard. No change to shape/shanten.
 * Invalid state is rejected, never silently clamped into a plausible count. */
export function adjustUkeire<T extends Ukeire>(base: T, overrides: RemainingOverrides, limits: readonly number[]): T {
  for (const [tile, count] of Object.entries(overrides)) {
    const index = NORMAL_TILES.indexOf(tile as TileCode);
    if (index < 0 || !Number.isInteger(count) || count! < 0 || count! > limits[index]!) {
      throw new RangeError('残枚数は牌種ごとの自動上限以内の整数にしてください。');
    }
  }
  const effective = base.effective.map((tile) => ({ ...tile, remaining: overrides[tile.tile] ?? tile.remaining }));
  const available = effective.filter((tile) => tile.remaining > 0);
  return { ...base, effective, kinds: available.length, total: available.reduce((sum, tile) => sum + tile.remaining, 0) };
}

/** Reset overrides synchronously by remounting the analysis session when its
 * physical tiles, meld configuration, or owning problem changes. Ordering alone
 * and non-analysis fields (title, explanation) leave the session intact. */
export function remainingSessionKey(input: AnalysisHand, problemId?: string): string {
  return JSON.stringify([
    problemId ?? '', [...input.concealed].sort(), input.drawn,
    input.melds.map((meld) => [meld.type, [...meld.tiles].sort(), meld.from, meld.calledIndex, meld.addedIndex]),
    [...input.doraIndicators].sort(),
  ]);
}
