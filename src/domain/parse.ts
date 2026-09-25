import { isTileCode, makeTile } from './tiles';
import type { Suit, TileCode } from './types';

export type ParseResult =
  | { ok: true; tiles: TileCode[]; normalized: string }
  | { ok: false; reason: string; partial?: string };

function nfkc(input: string): string {
  return input.normalize('NFKC');
}

/** 空白除去・全角英数字正規化。大文字の色記号も許容。 */
export function normalizeHandNotation(input: string): string {
  return nfkc(input)
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * 234m567p11z / 05p / 11123m 形式をパース。
 * 途中入力や無効文字は黙って捨てずエラーにする。
 */
export function parseHandNotation(input: string): ParseResult {
  const normalized = normalizeHandNotation(input);
  if (normalized === '') {
    return { ok: true, tiles: [], normalized };
  }

  if (!/^[0-9mpsz]+$/.test(normalized)) {
    return {
      ok: false,
      reason: '使える文字は数字と m/p/s/z だけです（例: 234m567p11z）',
      partial: normalized,
    };
  }

  const tiles: TileCode[] = [];
  let digits = '';

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!;
    if (ch >= '0' && ch <= '9') {
      digits += ch;
      continue;
    }
    // suit letter
    if (!digits) {
      return {
        ok: false,
        reason: `色記号「${ch}」の前に数字がありません`,
        partial: normalized,
      };
    }
    const suit = ch as Suit;
    for (const d of digits) {
      const rank = Number(d);
      if (d === '0') {
        if (suit === 'z') {
          return { ok: false, reason: '0z は扱えません', partial: normalized };
        }
        const tile = makeTile(5, suit, true);
        if (!tile) {
          return { ok: false, reason: `不正な牌: 0${suit}`, partial: normalized };
        }
        tiles.push(tile);
      } else if (suit === 'z') {
        if (rank < 1 || rank > 7) {
          return {
            ok: false,
            reason: `字牌は1〜7のみです（${rank}z）`,
            partial: normalized,
          };
        }
        tiles.push(`${rank}z` as TileCode);
      } else {
        if (rank < 1 || rank > 9) {
          return {
            ok: false,
            reason: `数牌は1〜9のみです（${rank}${suit}）`,
            partial: normalized,
          };
        }
        const tile = `${rank}${suit}` as TileCode;
        if (!isTileCode(tile)) {
          return { ok: false, reason: `不正な牌: ${tile}`, partial: normalized };
        }
        tiles.push(tile);
      }
    }
    digits = '';
  }

  if (digits) {
    return {
      ok: false,
      reason: '数字のあとに m/p/s/z を付けてください（入力途中）',
      partial: normalized,
    };
  }

  // 検索入力の同一牌4枚上限
  const counts = new Map<TileCode, number>();
  for (const t of tiles) {
    const n = (counts.get(t) ?? 0) + 1;
    if (n > 4) {
      return {
        ok: false,
        reason: `同じ牌は最大4枚までです（${t}）`,
        partial: normalized,
      };
    }
    counts.set(t, n);
  }

  return { ok: true, tiles, normalized };
}

/** 牌配列を簡潔な表記に戻す（表示・同期用） */
export function formatHandNotation(tiles: readonly TileCode[]): string {
  if (tiles.length === 0) return '';
  let out = '';
  let buf = '';
  let suit: string | null = null;
  for (const t of tiles) {
    const s = t[1]!;
    const d = t[0]!;
    if (suit !== null && s !== suit) {
      out += buf + suit;
      buf = '';
    }
    suit = s;
    buf += d;
  }
  if (suit) out += buf + suit;
  return out;
}
