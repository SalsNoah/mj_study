import type { Bank } from './templates';

export type Game = 'jantama' | 'tenhou' | 'other';

export const GAME_LABELS: Record<Game, string> = {
  jantama: '雀魂',
  tenhou: '天鳳',
  other: 'その他',
};

export type RegionKey =
  | 'hand'
  | 'melds'
  | 'dora'
  | 'round'
  | 'seat'
  | 'river'
  | 'scoreSelf'
  | 'scoreRight'
  | 'scoreAcross'
  | 'scoreLeft';

/** 画像サイズに対する割合（0〜1） */
export type RelRect = { x: number; y: number; w: number; h: number };

/** 画面比率ごとの範囲設定。同じ端末のスクショなら使い回せる */
export type Layout = {
  key: string;
  game: Game;
  aspect: string;
  regions: Partial<Record<RegionKey, RelRect>>;
  /** 手牌1枚の 幅/高さ（読み取り枠の高さ基準） */
  tileAspect: number;
  /** 河の中で牌1枚が占める明るい面積の割合 */
  riverTileFraction: number | null;
  /** 画面の点数表示の単位（天鳳は百点単位） */
  scoreUnit: number;
};

/** ゲームごとの見本。牌の絵柄・文字はゲームで決まるので端末をまたいで使える */
export type GameBank = { tiles: Bank; glyphs: Bank };

type Saved = {
  layouts: Record<string, Layout>;
  banks: Partial<Record<Game, GameBank>>;
};

const KEY = 'mahjong-study:import:v1';

function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { layouts: {}, banks: {} };
    const parsed = JSON.parse(raw) as Saved;
    return { layouts: parsed.layouts ?? {}, banks: parsed.banks ?? {} };
  } catch {
    return { layouts: {}, banks: {} };
  }
}

function write(saved: Saved): string | null {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
    return null;
  } catch {
    return '学習データを保存できませんでした（ブラウザの容量不足の可能性）';
  }
}

export function aspectKey(width: number, height: number): string {
  return (width / height).toFixed(2);
}

export function loadLayout(game: Game, aspect: string): Layout {
  const key = `${game}@${aspect}`;
  return (
    read().layouts[key] ?? {
      key,
      game,
      aspect,
      regions: {},
      tileAspect: 0.74,
      riverTileFraction: null,
      scoreUnit: game === 'tenhou' ? 100 : 1,
    }
  );
}

export function saveLayout(layout: Layout): string | null {
  const saved = read();
  saved.layouts[layout.key] = layout;
  return write(saved);
}

export function loadBank(game: Game): GameBank {
  return read().banks[game] ?? { tiles: {}, glyphs: {} };
}

export function saveBank(game: Game, bank: GameBank): string | null {
  const saved = read();
  saved.banks[game] = bank;
  return write(saved);
}

export function resetGame(game: Game): void {
  const saved = read();
  delete saved.banks[game];
  for (const k of Object.keys(saved.layouts)) {
    if (saved.layouts[k]!.game === game) delete saved.layouts[k];
  }
  write(saved);
}
