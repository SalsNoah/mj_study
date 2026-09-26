import { createId } from './ids';
import { isNumberTile, isRed, tileRank, tileSuit } from './tiles';
import type { Meld, MeldFrom, MeldType, TileCode } from './types';

/** 組成立判定では赤五を通常五として数える */
function canonicalForMeld(code: TileCode): string {
  return `${tileRank(code)}${tileSuit(code)}`;
}

export type MeldValidation =
  | { ok: true }
  | { ok: false; reason: string };

export function validateMeldShape(
  type: MeldType,
  tiles: readonly TileCode[],
  from: MeldFrom | null,
  calledIndex: number | null,
  addedIndex: number | null,
): MeldValidation {
  if (type === 'chi') {
    if (tiles.length !== 3) return { ok: false, reason: 'チーは3枚必要です' };
    if (from !== 'left') return { ok: false, reason: 'チーは左家からのみです' };
    if (calledIndex === null || calledIndex < 0 || calledIndex > 2) {
      return { ok: false, reason: '鳴いた牌の位置が不正です' };
    }
    if (!tiles.every(isNumberTile)) {
      return { ok: false, reason: 'チーは数牌のみです' };
    }
    const suit = tileSuit(tiles[0]!);
    if (!tiles.every((t) => tileSuit(t) === suit)) {
      return { ok: false, reason: 'チーは同色の連続牌です' };
    }
    const ranks = tiles.map(tileRank).sort((a, b) => a - b);
    if (ranks[0]! + 1 !== ranks[1] || ranks[1]! + 1 !== ranks[2]) {
      return { ok: false, reason: 'チーは連続する3枚である必要があります' };
    }
    if (new Set(ranks).size !== 3) {
      return { ok: false, reason: 'チーに同じ数字を含められません' };
    }
    return { ok: true };
  }

  if (type === 'pon') {
    if (tiles.length !== 3) return { ok: false, reason: 'ポンは3枚必要です' };
    if (!from) return { ok: false, reason: 'ポンの取得元を指定してください' };
    if (calledIndex === null || calledIndex < 0 || calledIndex > 2) {
      return { ok: false, reason: '鳴いた牌の位置が不正です' };
    }
    const keys = tiles.map(canonicalForMeld);
    if (new Set(keys).size !== 1) {
      return { ok: false, reason: 'ポンは同牌種3枚です' };
    }
    return { ok: true };
  }

  if (type === 'openKan' || type === 'closedKan' || type === 'addedKan') {
    if (tiles.length !== 4) return { ok: false, reason: '槓は4枚必要です' };
    const keys = tiles.map(canonicalForMeld);
    if (new Set(keys).size !== 1) {
      return { ok: false, reason: '槓は同牌種4枚です' };
    }
    if (type === 'closedKan') {
      if (from !== null) return { ok: false, reason: '暗槓に取得元は不要です' };
      if (calledIndex !== null) return { ok: false, reason: '暗槓に鳴き位置は不要です' };
      if (addedIndex !== null) return { ok: false, reason: '暗槓に加槓位置は不要です' };
      return { ok: true };
    }
    if (type === 'openKan') {
      if (!from) return { ok: false, reason: '明槓の取得元を指定してください' };
      if (calledIndex === null || calledIndex < 0 || calledIndex > 3) {
        return { ok: false, reason: '鳴いた牌の位置が不正です' };
      }
      if (addedIndex !== null) return { ok: false, reason: '明槓に加槓位置は不要です' };
      return { ok: true };
    }
    // addedKan
    if (!from) return { ok: false, reason: '加槓は元のポンの取得元を指定してください' };
    if (calledIndex === null || calledIndex < 0 || calledIndex > 2) {
      return { ok: false, reason: '元のポンの鳴き位置が不正です' };
    }
    if (addedIndex === null || addedIndex < 0 || addedIndex > 3) {
      return { ok: false, reason: '加槓の重ね位置が不正です' };
    }
    return { ok: true };
  }

  return { ok: false, reason: '未知の副露種類です' };
}

export function createMeld(
  type: MeldType,
  tiles: TileCode[],
  from: MeldFrom | null,
  calledIndex: number | null,
  addedIndex: number | null = null,
): { ok: true; meld: Meld } | { ok: false; reason: string } {
  const check = validateMeldShape(type, tiles, from, calledIndex, addedIndex);
  if (!check.ok) return check;
  return {
    ok: true,
    meld: {
      id: createId('meld'),
      type,
      tiles: [...tiles],
      from,
      calledIndex,
      addedIndex,
    },
  };
}

/** 取得元から横向きにする位置を決める（左家=左端、対面=2枚目、右家=右端） */
function calledIndexFor(type: MeldType, from: MeldFrom): number {
  if (from === 'left') return 0;
  if (from === 'opposite') return 1;
  return type === 'openKan' ? 3 : 2;
}

/** パレットで押した1枚から副露を組み立てる。チーは押した牌から始まる順子。 */
export function buildMeldFromTile(
  type: MeldType,
  code: TileCode,
  from: MeldFrom,
): { ok: true; meld: Meld } | { ok: false; reason: string } {
  const suit = tileSuit(code);
  const rank = tileRank(code);
  const normal = (r: number) => `${r}${suit}` as TileCode;

  if (type === 'chi') {
    if (!isNumberTile(code)) return { ok: false, reason: 'チーは数牌のみです' };
    if (rank > 7) return { ok: false, reason: 'チーは7以下の牌を押してください（押した牌から3枚）' };
    return createMeld('chi', [code, normal(rank + 1), normal(rank + 2)], 'left', 0);
  }

  const copies = type === 'pon' ? 3 : 4;
  const tiles: TileCode[] = [code];
  const base = isRed(code) ? normal(5) : code;
  while (tiles.length < copies) tiles.push(base);

  if (type === 'closedKan') return createMeld('closedKan', tiles, null, null, null);
  if (type === 'addedKan') {
    const idx = calledIndexFor('pon', from);
    return createMeld('addedKan', tiles, from, idx, idx);
  }
  return createMeld(type, tiles, from, calledIndexFor(type, from), null);
}

/** 副露1組を牌配列として展開（検索用） */
export function flattenMeldTiles(meld: Meld): TileCode[] {
  return [...meld.tiles];
}

export function isCompleteMeldDraft(
  type: MeldType,
  tiles: readonly TileCode[],
): boolean {
  if (type === 'chi' || type === 'pon') return tiles.length === 3;
  return tiles.length === 4;
}

/** 赤枚数カウント用に副露内の赤を数える補助 */
export function meldHasExtraRed(tiles: readonly TileCode[]): boolean {
  const reds = tiles.filter(isRed);
  return reds.length > 1;
}
