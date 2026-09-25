import { TILE_CODES, type Suit, type TileCode } from './types';

const TILE_SET = new Set<string>(TILE_CODES);

export function isTileCode(value: string): value is TileCode {
  return TILE_SET.has(value);
}

export function parseTileCode(value: string): TileCode | null {
  return isTileCode(value) ? value : null;
}

export function tileSuit(code: TileCode): Suit {
  return code[1] as Suit;
}

export function tileRank(code: TileCode): number {
  if (code[0] === '0') return 5;
  return Number(code[0]);
}

export function isRed(code: TileCode): boolean {
  return code[0] === '0';
}

export function isHonor(code: TileCode): boolean {
  return tileSuit(code) === 'z';
}

export function isNumberTile(code: TileCode): boolean {
  return !isHonor(code);
}

/** 検索用：赤を通常五に正規化（赤同一視） */
export function normalizeRedAsFive(code: TileCode): TileCode {
  if (isRed(code)) {
    return `${5}${tileSuit(code)}` as TileCode;
  }
  return code;
}

/** 表示・理牌用の並びキー */
export function tileSortKey(code: TileCode): number {
  const suitOrder: Record<Suit, number> = { m: 0, p: 1, s: 2, z: 3 };
  const suit = tileSuit(code);
  const rank = tileRank(code);
  // 同ランクの五は通常→赤
  const redBias = isRed(code) ? 0.5 : 0;
  return suitOrder[suit] * 100 + rank + redBias;
}

export const TILE_READING: Record<TileCode, string> = {
  '1m': '一萬', '2m': '二萬', '3m': '三萬', '4m': '四萬', '5m': '五萬',
  '0m': '赤五萬', '6m': '六萬', '7m': '七萬', '8m': '八萬', '9m': '九萬',
  '1p': '一筒', '2p': '二筒', '3p': '三筒', '4p': '四筒', '5p': '五筒',
  '0p': '赤五筒', '6p': '六筒', '7p': '七筒', '8p': '八筒', '9p': '九筒',
  '1s': '一索', '2s': '二索', '3s': '三索', '4s': '四索', '5s': '五索',
  '0s': '赤五索', '6s': '六索', '7s': '七索', '8s': '八索', '9s': '九索',
  '1z': '東', '2z': '南', '3z': '西', '4z': '北',
  '5z': '白', '6z': '發', '7z': '中',
};

export function tileLabel(code: TileCode): string {
  return TILE_READING[code];
}

export function makeTile(rank: number, suit: Suit, red = false): TileCode | null {
  if (suit === 'z') {
    if (rank < 1 || rank > 7) return null;
    return `${rank}z` as TileCode;
  }
  if (red) {
    if (rank !== 5) return null;
    return `0${suit}` as TileCode;
  }
  if (rank < 1 || rank > 9) return null;
  return `${rank}${suit}` as TileCode;
}

export function allTiles(): TileCode[] {
  return [...TILE_CODES];
}

export function countTiles(tiles: readonly TileCode[]): Map<TileCode, number> {
  const map = new Map<TileCode, number>();
  for (const t of tiles) {
    map.set(t, (map.get(t) ?? 0) + 1);
  }
  return map;
}

/** 赤・通常を合わせた同一牌種（ランク+スート）の枚数 */
export function countByRankSuit(tiles: readonly TileCode[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of tiles) {
    const key = `${tileRank(t)}${tileSuit(t)}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export function countRedsBySuit(tiles: readonly TileCode[]): Map<Suit, number> {
  const map = new Map<Suit, number>();
  for (const t of tiles) {
    if (isRed(t)) {
      const s = tileSuit(t);
      map.set(s, (map.get(s) ?? 0) + 1);
    }
  }
  return map;
}
