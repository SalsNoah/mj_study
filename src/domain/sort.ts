import { tileSortKey } from './tiles';
import type { TileCode } from './types';

/** 手牌だけを理牌。ツモ・副露は触らない。同ランク五は通常→赤。 */
export function sortConcealed(tiles: readonly TileCode[]): TileCode[] {
  return [...tiles].sort((a, b) => tileSortKey(a) - tileSortKey(b));
}

export function maybeSortConcealed(
  tiles: readonly TileCode[],
  autoSort: boolean,
): TileCode[] {
  return autoSort ? sortConcealed(tiles) : [...tiles];
}
