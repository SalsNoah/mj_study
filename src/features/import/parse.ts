import { createMeld } from '@/domain/melds';
import { isRed, isTileCode, tileRank, tileSuit } from '@/domain/tiles';
import type { Meld, MeldFrom, ProblemContext, TileCode, Wind } from '@/domain/types';

export const WIND_CHARS: Record<string, Wind> = { 東: '1z', 南: '2z', 西: '3z', 北: '4z' };
const WIND_ORDER: Wind[] = ['1z', '2z', '3z', '4z'];
const SCORE_KEY: Record<Wind, keyof ProblemContext['scores']> = {
  '1z': 'east',
  '2z': 'south',
  '3z': 'west',
  '4z': 'north',
};

export type Seat = 'self' | 'right' | 'across' | 'left';

const isDigit = (s: string) => /^[0-9]$/.test(s);

export function parseRound(labels: string[]): {
  roundWind: Wind | null;
  handNumber: number | null;
  honba: number | null;
} {
  const wi = labels.findIndex((l) => l in WIND_CHARS);
  const roundWind = wi >= 0 ? WIND_CHARS[labels[wi]!]! : null;
  const after = wi >= 0 ? labels.slice(wi + 1) : labels;
  const d = after.find(isDigit);
  const handNumber = d ? Number(d) : null;
  let honba: number | null = null;
  const hi = labels.indexOf('本');
  if (hi > 0) {
    let digits = '';
    for (let i = hi - 1; i >= 0 && isDigit(labels[i]!); i--) digits = labels[i] + digits;
    if (digits) honba = Number(digits);
  }
  return {
    roundWind,
    handNumber: handNumber !== null && handNumber >= 1 && handNumber <= 4 ? handNumber : null,
    honba,
  };
}

export function parseSeat(labels: string[]): Wind | null {
  const w = labels.find((l) => l in WIND_CHARS);
  return w ? WIND_CHARS[w]! : null;
}

/** 「12巡目」の先頭の数字を読む */
export function parseTurn(labels: string[]): number | null {
  let digits = '';
  for (const l of labels) {
    if (isDigit(l)) digits += l;
    else if (digits) break;
  }
  if (!digits) return null;
  return Math.min(18, Math.max(1, Number(digits)));
}

/** 数字だけを読み、単位（天鳳は百点単位）を掛ける。カンマは無視 */
export function parseScore(labels: string[], unit: number): number | null {
  const digits = labels.filter(isDigit).join('');
  if (!digits) return null;
  const sign = labels[0] === '-' ? -1 : 1;
  return sign * Number(digits) * unit;
}

/** 自分から見た位置の点数を、東南西北の点数に置き換える */
export function scoresBySeat(
  seatWind: Wind,
  bySeat: Partial<Record<Seat, number | null>>,
): ProblemContext['scores'] {
  const scores: ProblemContext['scores'] = { east: null, south: null, west: null, north: null };
  const base = WIND_ORDER.indexOf(seatWind);
  const offsets: Record<Seat, number> = { self: 0, right: 1, across: 2, left: 3 };
  for (const [seat, value] of Object.entries(bySeat) as Array<[Seat, number | null | undefined]>) {
    if (value === null || value === undefined) continue;
    const wind = WIND_ORDER[(base + offsets[seat]) % 4]!;
    scores[SCORE_KEY[wind]] = value;
  }
  return scores;
}

/** 読み取り用の見本として表示する文字列（点数を単位で割る） */
export function scoreChars(value: number, unit: number): string[] {
  const shown = Math.round(Math.abs(value) / unit);
  return [...(value < 0 ? ['-'] : []), ...String(shown).split('')];
}

export type MeldCell = { label: string | null; rotated: boolean };

function canonical(code: TileCode): string {
  return `${tileRank(code)}${tileSuit(code)}`;
}

function normalFive(code: TileCode): TileCode {
  return isRed(code) ? (`5${tileSuit(code)}` as TileCode) : code;
}

function fromIndex(idx: number, size: number): MeldFrom {
  if (idx <= 0) return 'left';
  if (idx >= size - 1) return 'right';
  return 'opposite';
}

/** 読み取った1組の牌（横向きの位置つき）から副露を組み立てる */
export function inferMeld(cells: MeldCell[]): { ok: true; meld: Meld } | { ok: false; reason: string } {
  const labels = cells.map((c) => c.label);
  const rot = cells.findIndex((c) => c.rotated);

  if (cells.length === 4 && labels[0] === 'back' && labels[3] === 'back') {
    const mid = labels.slice(1, 3).filter((l): l is TileCode => !!l && isTileCode(l));
    if (mid.length === 0) return { ok: false, reason: '暗槓の牌が読めません' };
    const base = normalFive(mid[0]!);
    return createMeld('closedKan', [base, mid[0]!, mid[1] ?? base, base], null, null, null);
  }

  if (!labels.every((l): l is TileCode => !!l && isTileCode(l))) {
    return { ok: false, reason: '読めていない牌があります' };
  }
  const codes = labels as TileCode[];
  const same = codes.every((c) => canonical(c) === canonical(codes[0]!));

  if (codes.length === 4 && same) {
    const idx = rot >= 0 ? rot : 0;
    return createMeld('openKan', codes, fromIndex(idx, 4), idx, null);
  }
  if (codes.length === 3 && same) {
    const idx = rot >= 0 ? rot : 0;
    return createMeld('pon', codes, fromIndex(idx, 3), idx, null);
  }
  if (codes.length === 3) {
    return createMeld('chi', codes, 'left', rot >= 0 ? rot : 0, null);
  }
  return { ok: false, reason: `${codes.length}枚の組は副露として読めません` };
}

/**
 * 隙間なく並んだ鳴き牌を1組ずつに分ける。1組は3枚か4枚で、横向きの牌を1枚含む
 * （暗槓は両端が裏向き）。副露として成り立つ分け方を優先する。
 */
export function splitMelds<T extends MeldCell>(cells: T[]): T[][] {
  const chunkScore = (chunk: T[]): number | null => {
    const rotated = chunk.filter((c) => c.rotated).length;
    const closedKan = chunk.length === 4 && chunk[0]!.label === 'back' && chunk[3]!.label === 'back';
    if (!closedKan && rotated > (chunk.length === 4 ? 2 : 1)) return null;
    let score = rotated === 1 || closedKan ? 1 : 0;
    if (inferMeld(chunk).ok) score += 2;
    return score;
  };
  const best: Array<{ score: number; parts: T[][] } | null> = [{ score: 0, parts: [] }];
  for (let i = 1; i <= cells.length; i++) {
    best[i] = null;
    for (const size of [3, 4]) {
      const prev = best[i - size];
      if (i < size || !prev) continue;
      const chunk = cells.slice(i - size, i);
      const s = chunkScore(chunk);
      if (s === null) continue;
      if (!best[i] || prev.score + s > best[i]!.score) best[i] = { score: prev.score + s, parts: [...prev.parts, chunk] };
    }
  }
  return best[cells.length]?.parts ?? [cells];
}
