/**
 * スクショ1枚から、範囲指定なしで牌姿と対局条件を読む。
 * 見本はこのアプリに同梱した雀魂・天鳳の特徴量（import-model.json）と、
 * 利用者が確認画面で直した牌（この端末に保存）を合わせて使う。
 */
import type { Wind } from '@/domain/types';
import {
  centerRegions,
  locateHand,
  locatePanelDora,
  locateWallDora,
  type CenterKey,
  type Game,
} from './auto';
import {
  crop,
  cropBrightRows,
  dropSmallGlyphs,
  glyphFeature,
  rotate,
  segmentGlyphs,
  segmentMelds,
  segmentTiles,
  tileFeature,
  type Img,
  type Rect,
  type TextTone,
} from './imageTools';
import { estimateScores, inferMeld, parseRound, parseSeat, parseTurn, splitMelds, type Seat } from './parse';
import { toDataUrl, type TileCell, type Turn } from './recognize';
import { classify, learn, prepareBank, type Bank, type PreparedBank } from './templates';

export type { Game } from './auto';

export const GAME_NAMES: Record<Game, string> = { jantama: '雀魂', tenhou: '天鳳' };

export type GameBanks = { tiles: Bank; glyphs: Bank };
export type Model = Record<Game, GameBanks>;

const TILE_ASPECT = 0.74;
const TILE_SURE = 0.8;
const TILE_MARGIN = 0.03;
/** これより低い一致度の文字は読めなかったものとして扱う（誤った点数を入れるより空欄の方がよい） */
const GLYPH_OK = 0.62;
/** 天鳳の山の牌は斜めから見た形になるので、ドラは低めの一致度でも候補にする（自信がなければ「?」付き） */
const DORA_OK = 0.56;
/** 手牌の平均一致度がこれより低ければ、対応していない画面とみなす */
const HAND_OK = 0.5;

let modelPromise: Promise<Model> | null = null;

export function loadModel(): Promise<Model> {
  modelPromise ??= fetch(`${import.meta.env.BASE_URL}import-model.json`)
    .then((r) => {
      if (!r.ok) throw new Error('読み取り用データを取得できません');
      return r.json() as Promise<{ games: Model }>;
    })
    .then((j) => j.games)
    .catch((e: unknown) => {
      modelPromise = null;
      throw e;
    });
  return modelPromise;
}

const LOCAL_KEY = 'mahjong-study:import:v2';

export function loadLocalBanks(): Partial<Model> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Partial<Model>) : {};
  } catch {
    return {};
  }
}

/** 確認画面で直した牌を、その牌の見本として覚える */
export function rememberTile(game: Game, label: string, feat: Uint8Array): void {
  const local = loadLocalBanks();
  const current = local[game] ?? { tiles: {}, glyphs: {} };
  local[game] = { ...current, tiles: learn(current.tiles, label, feat) };
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(local));
  } catch {
    // 容量不足でも読み取り自体は続けられる
  }
}

function merge(a: Bank, b: Bank | undefined): Bank {
  if (!b) return a;
  const out: Bank = { ...a };
  for (const [label, list] of Object.entries(b)) out[label] = [...(out[label] ?? []), ...list];
  return out;
}

export type Prepared = Record<Game, { tiles: PreparedBank; glyphs: PreparedBank }>;

export function prepareModel(model: Model, local: Partial<Model>): Prepared {
  const one = (g: Game) => ({
    tiles: prepareBank(merge(model[g].tiles, local[g]?.tiles)),
    glyphs: prepareBank(merge(model[g].glyphs, local[g]?.glyphs)),
  });
  return { jantama: one('jantama'), tenhou: one('tenhou') };
}

function turnImage(img: Img, t: Turn): Img {
  if (t === 90) return rotate(img, 'cw');
  if (t === 270) return rotate(img, 'ccw');
  if (t === 180) return rotate(rotate(img, 'cw'), 'cw');
  return img;
}

function toCell(tile: Img, bank: PreparedBank, turns: Turn[], rotated: boolean): TileCell & { score: number } {
  let best: { feat: Uint8Array; match: ReturnType<typeof classify> } | null = null;
  for (const t of turns) {
    const feat = tileFeature(turnImage(tile, t));
    const match = classify(bank, feat);
    if (!best || match.score > best.match.score) best = { feat, match };
  }
  const { feat, match } = best!;
  return {
    label: match.label,
    sure: !!match.label && match.score >= TILE_SURE && match.margin >= TILE_MARGIN,
    feat,
    preview: toDataUrl(tile),
    rotated,
    score: match.score,
  };
}

export function rematchCell(cell: TileCell, bank: PreparedBank): TileCell {
  if (cell.sure) return cell;
  const match = classify(bank, cell.feat);
  return {
    ...cell,
    label: match.label ?? cell.label,
    sure: !!match.label && match.score >= TILE_SURE && match.margin >= TILE_MARGIN,
  };
}

type GlyphRead = { label: string; score: number; h: number };

const SCORE_SEATS: Array<{ key: CenterKey; seat: Seat; turn: Turn }> = [
  { key: 'scoreSelf', seat: 'self', turn: 0 },
  { key: 'scoreRight', seat: 'right', turn: 90 },
  { key: 'scoreAcross', seat: 'across', turn: 180 },
  { key: 'scoreLeft', seat: 'left', turn: 270 },
];

function readText(
  img: Img,
  rect: Rect,
  bank: PreparedBank,
  opts: { turn: Turn; mergeNarrow: boolean; splitWide: boolean; tone: TextTone; dropSmall: boolean },
): GlyphRead[] {
  const region = turnImage(crop(img, rect), opts.turn);
  const seg = segmentGlyphs(region, opts.mergeNarrow, opts.splitWide, opts.tone);
  const boxes = opts.dropSmall ? dropSmallGlyphs(seg.boxes) : seg.boxes;
  return boxes.map((b) => {
    const m = classify(bank, glyphFeature(seg.ink, region.width, b));
    return { label: m.label && m.score >= GLYPH_OK ? m.label : '', score: m.score, h: b.h };
  });
}

/** 数字の並びとして自然なときだけ点数にする（雀魂は百点未満が00、天鳳は百点単位の表示） */
function scoreOf(glyphs: GlyphRead[], game: Game): number | null {
  if (glyphs.length === 0 || glyphs.some((g) => !/^[0-9]$/.test(g.label))) return null;
  const text = glyphs.map((g) => g.label).join('');
  if (game === 'jantama') {
    if (text.length < 3 || text.length > 6 || !text.endsWith('00') || (text.length > 1 && text[0] === '0')) return null;
    return Number(text);
  }
  if (text.length > 4 || (text.length > 1 && text[0] === '0')) return null;
  return Number(text) * 100;
}

/** 枠の縦線などを除くため、文字の高さの中央値から大きく外れる塊を捨てる */
function typicalHeight(glyphs: GlyphRead[]): GlyphRead[] {
  if (glyphs.length < 3) return glyphs;
  const hs = glyphs.map((g) => g.h).sort((a, b) => a - b);
  const median = hs[Math.floor(hs.length / 2)]!;
  return glyphs.filter((g) => g.h <= median * 1.2);
}

function insideCenter(r: Rect, img: Img, tileH: number): boolean {
  const cx = r.x + r.w / 2 - img.width / 2;
  const cy = r.y + r.h / 2 - img.height / 2;
  return Math.abs(cx) < tileH * 1.9 && cy > -tileH * 2.1 && cy < tileH * 0.35;
}

/**
 * ドラ表示牌の候補を絞る。山の側面や裏向きの牌のような模様のない白い部分は白（5z）に似るので、
 * 白は他に候補がなく、よく一致するときだけ採る。byScore は一致度の高い順に並べ直す（天鳳の山）。
 */
function plausibleDora<T extends TileCell & { score: number }>(cells: T[], byScore: boolean): T[] {
  const found = cells.filter((c) => c.score >= DORA_OK);
  if (byScore) found.sort((a, b) => b.score - a.score);
  const others = found.filter((c) => c.label !== '5z');
  if (others.length === 0) return found.filter((c) => c.score >= 0.9).slice(0, 1);
  const top = Math.max(...others.map((c) => c.score));
  return others.filter((c) => !byScore || c.score >= top - 0.15).slice(0, 5);
}

export type AutoResult = {
  game: Game;
  hand: TileCell[];
  melds: TileCell[][];
  dora: TileCell[];
  roundWind: Wind | null;
  handNumber: number | null;
  seatWind: Wind | null;
  turn: number | null;
  players: 3 | 4;
  scores: Record<Seat, number | null>;
  /** 読めずに合計点から推定した席 */
  estimated: Seat[];
};

export function autoRead(img: Img, banks: Prepared): AutoResult | null {
  const located = locateHand(img);
  if (!located.hand) return null;
  const tileH = located.tileH;

  const handRegion = crop(img, located.hand);
  const tiles = segmentTiles(handRegion, TILE_ASPECT).spans.map((s) => cropBrightRows(handRegion, s));
  if (tiles.length === 0) return null;

  // どちらのゲームの見本によく合うかでゲームを決める
  const feats = tiles.map((t) => tileFeature(t));
  const fit = (g: Game) =>
    feats.reduce((sum, f) => sum + classify(banks[g].tiles, f).score, 0) / feats.length;
  const fits = { jantama: fit('jantama'), tenhou: fit('tenhou') };
  const game: Game = fits.jantama >= fits.tenhou ? 'jantama' : 'tenhou';
  if (tiles.length < 4 || fits[game] < HAND_OK) return null;
  const bank = banks[game];

  const hand = tiles.map((t) => toCell(t, bank.tiles, [0], false));

  let melds: TileCell[][] = [];
  if (located.melds) {
    const region = crop(img, located.melds);
    melds = segmentMelds(region, TILE_ASPECT)
      .flatMap((group) =>
        splitMelds(
          group.map((s) => toCell(cropBrightRows(region, s), bank.tiles, s.rotated ? [90, 270] : [0], s.rotated)),
        ),
      )
      // 副露として成り立たない組は、画面の端で欠けた牌などの読み違いがあるので確認してもらう
      .map((m) => (inferMeld(m).ok ? m : m.map((c) => ({ ...c, sure: false }))));
  }

  let dora: TileCell[] = [];
  if (game === 'jantama') {
    dora = plausibleDora(
      locatePanelDora(img, tileH).map((r) => toCell(crop(img, r), bank.tiles, [0], false)),
      false,
    );
  } else {
    // 山は四方にあり、表を向いた牌は横向き・逆さまにもなる
    dora = plausibleDora(
      locateWallDora(img, tileH, located.hand.y)
        .filter((r) => !insideCenter(r, img, tileH))
        .map((r) => toCell(crop(img, r), bank.tiles, [0, 90, 180, 270], false)),
      true,
    );
  }

  const regions = centerRegions(game, img, tileH);
  const text = (key: CenterKey, opts: Parameters<typeof readText>[3]) => {
    const rect = regions[key];
    return rect ? readText(img, rect, bank.glyphs, opts) : [];
  };
  const tone: TextTone = 'bright';
  const round = parseRound(
    text('round', { turn: 0, mergeNarrow: false, splitWide: false, tone, dropSmall: false }).map((g) => g.label),
  );
  const seatGlyphs = text('seat', { turn: 0, mergeNarrow: true, splitWide: false, tone, dropSmall: false });
  const seatWind = parseSeat(seatGlyphs.map((g) => g.label));
  const turnGlyphs =
    game === 'jantama'
      ? typicalHeight(text('turnText', { turn: 0, mergeNarrow: false, splitWide: false, tone: 'dark', dropSmall: false }))
      : [];
  const read: Record<Seat, number | null> = { self: null, right: null, across: null, left: null };
  let acrossGlyphs = 0;
  for (const s of SCORE_SEATS) {
    const glyphs = text(s.key, { turn: s.turn, mergeNarrow: false, splitWide: true, tone, dropSmall: true });
    if (s.seat === 'across') acrossGlyphs = glyphs.filter((g) => g.h >= (regions.scoreAcross?.h ?? 0) * 0.3).length;
    // 天鳳は点数の横に風の文字が付くことがあるので、先頭の風は除く
    const digits = glyphs.filter((g, i) => !(i === 0 && /^[東南西北]$/.test(g.label)));
    read[s.seat] = scoreOf(digits, game);
  }
  // 対面の位置に文字が何もなければ三人麻雀
  const players: 3 | 4 = read.across === null && acrossGlyphs < 2 ? 3 : 4;
  const { scores, estimated } = estimateScores(read, players);

  return {
    game,
    hand,
    melds,
    dora,
    roundWind: round.roundWind,
    handNumber: round.handNumber,
    seatWind,
    turn: parseTurn(turnGlyphs.map((g) => g.label)),
    players,
    scores,
    estimated,
  };
}
