import { countByRankSuit, countRedsBySuit, tileLabel } from './tiles';
import type { TileCode } from './types';

/** Physical known tiles: red and ordinary fives share a four-copy supply.
 * A meld candidate contributes its entire three/four tiles, not just its anchor. */
export function tileSupplyIssues(tiles: readonly TileCode[]): string[] {
  const issues: string[] = [];
  for (const [code, count] of countByRankSuit(tiles)) {
    if (count > 4) issues.push(`${tileLabel(code as TileCode)}は赤・通常を合わせて最大4枚です（追加後${count}枚）。`);
  }
  for (const [suit, count] of countRedsBySuit(tiles)) {
    if (count > 1) issues.push(`${tileLabel(`0${suit}` as TileCode)}は最大1枚です（追加後${count}枚）。`);
  }
  return issues;
}

/** Reject only overflows touched by this addition. Existing invalid input remains
 * visible and removable; unrelated additions never silently sanitize it. */
export function tileAdditionIssue(known: readonly TileCode[], added: readonly TileCode[]): string | null {
  const kinds = new Set(countByRankSuit(added).keys());
  const reds = new Set(countRedsBySuit(added).keys());
  const all = [...known, ...added];
  for (const [code, count] of countByRankSuit(all)) {
    if (kinds.has(code) && count > 4) return `${tileLabel(code as TileCode)}は赤・通常を合わせて最大4枚です（追加後${count}枚）。`;
  }
  for (const [suit, count] of countRedsBySuit(all)) {
    if (reds.has(suit) && count > 1) return `${tileLabel(`0${suit}` as TileCode)}は最大1枚です（追加後${count}枚）。`;
  }
  return null;
}
