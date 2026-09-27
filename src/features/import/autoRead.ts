/**
 * スクショ1枚から、範囲指定なしで牌姿と対局条件を読む。
 * 見本はこのアプリに同梱した雀魂・天鳳の特徴量（import-model.json）と、
 * 利用者が確認画面で直した牌（この端末に保存）を合わせて使う。
 */
import type { Wind } from '@/domain/types';
import {
  centerRegions,
  locateHand,
  locateJantamaPanel,
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
  resample,
  rotate,
  segmentGlyphs,
  segmentMelds,
  segmentTiles,
  tileFeature,
  type Img,
  type Rect,
  type TextTone,
} from './imageTools';
import {
  estimateScores,
  inferMeld,
  parseRound,
  parseSeat,
  parseTurn,
  sortedLabels,
  splitMelds,
  type Seat,
} from './parse';
import { toDataUrl, type TileCell, type Turn } from './recognize';
import { classify, labelScores, learn, prepareBank, type Bank, type PreparedBank } from './templates';

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

/** 見本の切り出し方を変えたら上げる（古い見本がブラウザに残っていても新しい読み方と組み合わせない） */
const MODEL_VERSION = 3;

let modelPromise: Promise<Model> | null = null;

export function loadModel(): Promise<Model> {
  modelPromise ??= fetch(`${import.meta.env.BASE_URL}import-model.json?v=${MODEL_VERSION}`)
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

/**
 * 手牌はツモ牌（14枚目にあたる右端の1枚）以外は理牌されているので、並び順が崩れない読み方を選ぶ。
 * 並び順のために1位以外のラベルにした牌は、そのラベルとの一致度が十分なときだけ確定扱いにする。
 */
function sortedHand(tiles: Img[], feats: Uint8Array[], bank: PreparedBank): TileCell[] {
  const scores = feats.map((f) => labelScores(bank, f));
  const drawn = tiles.length % 3 === 2 ? 1 : 0;
  const ordered = sortedLabels(scores.slice(0, tiles.length - drawn));
  return tiles.map((tile, i) => {
    const [top, second] = [...scores[i]!.entries()].sort((a, b) => b[1] - a[1]);
    const label = ordered[i] ?? top?.[0] ?? null;
    const score = label ? (scores[i]!.get(label) ?? 0) : 0;
    const topScore = top?.[1] ?? 0;
    const clear =
      label === top?.[0] ? topScore - (second?.[1] ?? -1) >= TILE_MARGIN : topScore - score < TILE_MARGIN * 2;
    return {
      label,
      sure: !!label && score >= TILE_SURE && clear,
      feat: feats[i]!,
      preview: toDataUrl(tile),
      rotated: false,
    };
  });
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

/** alts は一致度の高い順の候補（合計点が合わないときの読み直しに使う） */
type GlyphRead = { label: string; score: number; h: number; alts: Array<[string, number]> };

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
  return glyphFeats(turnImage(crop(img, rect), opts.turn), opts).map((f) => readGlyph(bank, f));
}

type GlyphFeat = { feat: Uint8Array; h: number };

function glyphFeats(
  region: Img,
  opts: { mergeNarrow: boolean; splitWide: boolean; tone: TextTone; dropSmall: boolean },
): GlyphFeat[] {
  const seg = segmentGlyphs(region, opts.mergeNarrow, opts.splitWide, opts.tone);
  const boxes = opts.dropSmall ? dropSmallGlyphs(seg.boxes) : seg.boxes;
  return boxes.map((b) => ({ feat: glyphFeature(seg.ink, region.width, b), h: b.h }));
}

function readGlyph(bank: PreparedBank, g: GlyphFeat): GlyphRead {
  const alts = [...labelScores(bank, g.feat).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const [label, score] = alts[0] ?? ['', 0];
  return { label: score >= GLYPH_OK ? label : '', score, h: g.h, alts };
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * 雀魂の中央パネルを真上から見た正方形に直したときの位置（0〜1、自分の席を下にした向き）。
 * 各家の点数と風の札はその家の方を向いて書かれているので、パネルを90度ずつ回して同じ位置を読む。
 */
const PANEL_BOX: Record<'score' | 'wind' | 'round', Box> = {
  /** その家の点数（パネルの内側の、その家の側）。すぐ外側の手番を示す黄色い帯は入れない */
  score: { x: 0.3, y: 0.635, w: 0.4, h: 0.125 },
  /** その家の風の札（その家から見てパネルの左下の角） */
  wind: { x: 0.02, y: 0.73, w: 0.2, h: 0.22 },
  round: { x: 0.33, y: 0.34, w: 0.34, h: 0.15 },
};
/** パネルの四隅の外に付いた風の札まで入れるための余白（パネルの幅・高さに対する割合） */
const PANEL_MARGIN = 0.12;

function panelSquare(img: Img, core: Rect): Img {
  const mx = core.w * PANEL_MARGIN;
  const my = core.h * PANEL_MARGIN;
  const size = Math.max(200, Math.min(480, Math.round(core.w + mx * 2)));
  return resample(crop(img, { x: core.x - mx, y: core.y - my, w: core.w + mx * 2, h: core.h + my * 2 }), size, size);
}

function boxIn(view: Img, b: Box): Rect {
  return { x: b.x * view.width, y: b.y * view.height, w: b.w * view.width, h: b.h * view.height };
}

const WIND_CHARS = ['東', '南', '西', '北'] as const;
const WIND_CODES: Wind[] = ['1z', '2z', '3z', '4z'];

/** 風の札の文字（一番大きい塊）と、赤い画素の割合（東の札だけ赤い） */
function windLabel(view: Img): { glyph: Uint8Array | null; red: number } {
  const region = crop(view, boxIn(view, PANEL_BOX.wind));
  const n = region.width * region.height;
  let red = 0;
  for (let i = 0; i < n; i++) {
    const r = region.data[i * 4]!;
    const g = region.data[i * 4 + 1]!;
    const b = region.data[i * 4 + 2]!;
    if (r > 130 && r > g * 1.7 && r > b * 1.5) red++;
  }
  const seg = segmentGlyphs(region, true, false, 'light');
  const box = seg.boxes
    .filter((b) => b.h >= region.height * 0.3)
    .reduce<Rect | null>((p, c) => (!p || c.w * c.h > p.w * p.h ? c : p), null);
  return { glyph: box ? glyphFeature(seg.ink, region.width, box) : null, red: red / n };
}

/** 雀魂の中央パネルから切り出した文字。見本づくりと読み取りで同じ切り出し方を使う */
export type PanelGlyphs = {
  /** 自分・下家・対面・上家の順に、各家の点数の数字 */
  scores: GlyphFeat[][];
  /** 同じ順に、各家の風の札 */
  winds: Array<{ glyph: Uint8Array | null; red: number }>;
  round: GlyphFeat[];
  /** 点数欄の高さ（対面の欄にこれに見合う文字がなければ三麻） */
  scoreH: number;
};

export function panelGlyphs(img: Img, tileH: number): PanelGlyphs {
  const square = panelSquare(img, locateJantamaPanel(img, tileH));
  const views = SCORE_SEATS.map((s) => turnImage(square, s.turn));
  const self = views[0]!;
  return {
    scores: views.map((v) =>
      typicalHeight(
        glyphFeats(crop(v, boxIn(v, PANEL_BOX.score)), { mergeNarrow: false, splitWide: true, tone: 'light', dropSmall: true }),
      ),
    ),
    winds: views.map(windLabel),
    round: glyphFeats(crop(self, boxIn(self, PANEL_BOX.round)), {
      mergeNarrow: false,
      splitWide: false,
      tone: 'light',
      dropSmall: false,
    }),
    scoreH: boxIn(self, PANEL_BOX.score).h,
  };
}

/** 風の札の読み：赤い画素の割合と、東南西北それぞれとの一致度 */
type WindRead = { red: number; sims: number[] };

/** 赤い札は文字の形よりずっと確かな手がかりなので、一致度より重く見る */
const RED_WEIGHT = 4;

/**
 * 四隅の風は、自分の札から反時計回り（下家→対面→上家）に東南西北の順で並ぶ（三麻は北家がなく対面が空く）。
 * 並び順として成り立つ組み合わせのうち、赤い札の位置と文字の形に一番合うものから自風を決める。
 */
export function decodeSeatWind(reads: WindRead[], players: 3 | 4): Wind | null {
  const seats = players === 4 ? [0, 1, 2, 3] : [0, 1, 3];
  const n = seats.length;
  const ranked = Array.from({ length: n }, (_, self) => {
    let s = 0;
    seats.forEach((k, i) => {
      const w = (self + i) % n;
      const read = reads[k]!;
      s += read.sims[w]! + (w === 0 ? read.red : -read.red) * RED_WEIGHT;
    });
    return { self, s };
  }).sort((a, b) => b.s - a.s);
  const [best, second] = ranked;
  if (!best || (second && best.s - second.s < 0.1)) return null;
  return WIND_CODES[best.self]!;
}

/** 点数の読みを数字に（雀魂は百点未満が00、天鳳は百点単位の表示） */
function scoreText(text: string, game: Game): number | null {
  if (!/^[0-9]+$/.test(text) || (text.length > 1 && text[0] === '0')) return null;
  if (game === 'jantama') return text.length >= 3 && text.length <= 6 && text.endsWith('00') ? Number(text) : null;
  return text.length <= 4 ? Number(text) * 100 : null;
}

/** 供託の千点棒は画面の点数に含まれないので、合計は持ち点の合計から千点単位で少なくなる（供託は多くても数本） */
function fitsTotal(sum: number, players: 3 | 4): boolean {
  const lack = (players === 4 ? 100000 : 105000) - sum;
  return lack >= 0 && lack % 1000 === 0 && lack <= 5000;
}

const topLabel = (g: GlyphRead) => g.alts[0]?.[0] ?? '';

/** 一致度が低くても一番近い数字で読んだ点数（合計点と照らし合わせて使う） */
function looseScore(gs: GlyphRead[], game: Game): number | null {
  if (gs.length === 0 || gs.some((g) => !/^[0-9]$/.test(topLabel(g)))) return null;
  return scoreText(gs.map(topLabel).join(''), game);
}

/**
 * 点数を合計点と照らし合わせる。一致度が低くて読めなかった点数も、一番近い数字で読んだ全員の合計が
 * 合えば正しいとみなす。合わなければ、数字1文字だけを次点の候補に替えて合計が合う読み方のうち、
 * 一致度の落ち方が一番小さいものを採る。読み直した席を返す。
 */
function checkByTotal(
  glyphs: Partial<Record<Seat, GlyphRead[]>>,
  read: Record<Seat, number | null>,
  players: 3 | 4,
  game: Game,
): Seat | null {
  const seats = (Object.keys(glyphs) as Seat[]).filter((s) => glyphs[s]!.length > 0);
  const loose = seats.map((s) => looseScore(glyphs[s]!, game));
  if (seats.length !== players || loose.some((v) => v === null)) return null;
  const total = loose.reduce<number>((n, v) => n + v!, 0);
  if (fitsTotal(total, players)) {
    seats.forEach((s, i) => (read[s] = loose[i]!));
    return null;
  }
  const candidates: Array<{ seat: Seat; value: number; cost: number }> = [];
  seats.forEach((seat, k) => {
    const gs = glyphs[seat]!;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i]!;
      for (const [label, score] of g.alts.slice(1)) {
        if (!/^[0-9]$/.test(label)) continue;
        const value = scoreText(gs.map((x, j) => (j === i ? label : topLabel(x))).join(''), game);
        if (value === null || !fitsTotal(total - loose[k]! + value, players)) continue;
        candidates.push({ seat, value, cost: g.score - score });
      }
    }
  });
  const best = candidates.sort((a, b) => a.cost - b.cost)[0];
  if (!best || best.cost > 0.15) return null;
  seats.forEach((s, i) => (read[s] = loose[i]!));
  read[best.seat] = best.value;
  return best.seat;
}

/** 取りうる文字のうち一番近いもの（形がそれなりに合うときだけ） */
function pickLabel(bank: PreparedBank, g: GlyphFeat, labels: readonly string[]): string | null {
  const scores = labelScores(bank, g.feat);
  let best: [string, number] | null = null;
  for (const l of labels) {
    const s = scores.get(l) ?? -1;
    if (!best || s > best[1]) best = [l, s];
  }
  return best && best[1] >= 0.5 ? best[0] : null;
}

/** 雀魂の局は「東3局」のように風・数字・局の3文字なので、それぞれの位置で取りうる文字から選ぶ */
function panelRound(round: GlyphFeat[], bank: PreparedBank): ReturnType<typeof parseRound> {
  if (round.length !== 3) return parseRound(round.map((f) => readGlyph(bank, f).label));
  const wind = pickLabel(bank, round[0]!, WIND_CHARS);
  const num = pickLabel(bank, round[1]!, ['1', '2', '3', '4']);
  return {
    roundWind: wind ? WIND_CODES[WIND_CHARS.indexOf(wind as (typeof WIND_CHARS)[number])]! : null,
    handNumber: num ? Number(num) : null,
    honba: null,
  };
}

type PanelRead = {
  round: ReturnType<typeof parseRound>;
  seatWind: Wind | null;
  glyphs: Record<Seat, GlyphRead[]>;
  acrossGlyphs: number;
};

/**
 * 雀魂の中央パネル。自分の席が下になる向きから90度ずつ回し、そのたびに下側に来た家の
 * 点数（正しい向きで読めるので6と9を取り違えない）と、左下の角の風の札を読む。
 */
function readJantamaPanel(img: Img, tileH: number, bank: PreparedBank): PanelRead {
  const p = panelGlyphs(img, tileH);
  const glyphs = {} as Record<Seat, GlyphRead[]>;
  SCORE_SEATS.forEach((s, k) => {
    glyphs[s.seat] = p.scores[k]!.map((f) => readGlyph(bank, f));
  });
  // 数字は点数欄の高さの半分ほど。三麻の空いた欄に写る枠の切れ端はそれより低い
  const acrossGlyphs = p.scores[2]!.filter((g) => g.h >= p.scoreH * 0.42).length;
  const round = panelRound(p.round, bank);
  const winds = p.winds.map((w) => {
    const sims = w.glyph ? labelScores(bank, w.glyph) : new Map<string, number>();
    return { red: w.red, sims: WIND_CHARS.map((c) => sims.get(c) ?? 0) };
  });
  const players: 3 | 4 = acrossGlyphs < 2 ? 3 : 4;
  return { round, seatWind: decodeSeatWind(winds, players), glyphs, acrossGlyphs };
}

/** 数字の並びとして自然なときだけ点数にする */
function scoreOf(glyphs: GlyphRead[], game: Game): number | null {
  if (glyphs.length === 0 || glyphs.some((g) => !/^[0-9]$/.test(g.label))) return null;
  return scoreText(glyphs.map((g) => g.label).join(''), game);
}

/** 枠の縦線などを除くため、文字の高さの中央値から大きく外れる塊を捨てる */
function typicalHeight<T extends { h: number }>(glyphs: T[]): T[] {
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
  /** 読めずに合計点から推定した席、または合計点が合うように読み直した席 */
  estimated: Seat[];
};

export function autoRead(img: Img, banks: Prepared): AutoResult | null {
  const located = locateHand(img);
  if (!located.hand) return null;
  const tileH = located.tileH;

  const handRegion = crop(img, located.hand);
  const tiles = segmentTiles(handRegion, TILE_ASPECT).spans.map((s) => cropBrightRows(handRegion, s));
  // 手牌は最大14枚。それより多いのは演出や結果画面の帯を手牌と取り違えたとき
  if (tiles.length === 0 || tiles.length > 14) return null;

  // どちらのゲームの見本によく合うかでゲームを決める
  const feats = tiles.map((t) => tileFeature(t));
  const fit = (g: Game) =>
    feats.reduce((sum, f) => sum + classify(banks[g].tiles, f).score, 0) / feats.length;
  const fits = { jantama: fit('jantama'), tenhou: fit('tenhou') };
  const game: Game = fits.jantama >= fits.tenhou ? 'jantama' : 'tenhou';
  if (tiles.length < 4 || fits[game] < HAND_OK) return null;
  const bank = banks[game];

  const hand = sortedHand(tiles, feats, bank.tiles);

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
  let round: ReturnType<typeof parseRound>;
  let seatWind: Wind | null;
  let glyphs: Record<Seat, GlyphRead[]>;
  let acrossGlyphs: number;
  if (game === 'jantama') {
    ({ round, seatWind, glyphs, acrossGlyphs } = readJantamaPanel(img, tileH, bank.glyphs));
  } else {
    round = parseRound(
      text('round', { turn: 0, mergeNarrow: false, splitWide: false, tone, dropSmall: false }).map((g) => g.label),
    );
    seatWind = parseSeat(
      text('seat', { turn: 0, mergeNarrow: true, splitWide: false, tone, dropSmall: false }).map((g) => g.label),
    );
    glyphs = {} as Record<Seat, GlyphRead[]>;
    acrossGlyphs = 0;
    for (const s of SCORE_SEATS) {
      const gs = text(s.key, { turn: s.turn, mergeNarrow: false, splitWide: true, tone, dropSmall: true });
      if (s.seat === 'across') acrossGlyphs = gs.filter((g) => g.h >= (regions.scoreAcross?.h ?? 0) * 0.3).length;
      // 天鳳は点数の横に風の文字が付くことがあるので、先頭の風は除く
      glyphs[s.seat] = gs.filter((g, i) => !(i === 0 && /^[東南西北]$/.test(g.label)));
    }
  }
  const turnGlyphs =
    game === 'jantama'
      ? typicalHeight(text('turnText', { turn: 0, mergeNarrow: false, splitWide: false, tone: 'dark', dropSmall: false }))
      : [];
  const read: Record<Seat, number | null> = { self: null, right: null, across: null, left: null };
  for (const s of SCORE_SEATS) read[s.seat] = scoreOf(glyphs[s.seat], game);
  // 対面の位置に文字が何もなければ三人麻雀
  const players: 3 | 4 = read.across === null && acrossGlyphs < 2 ? 3 : 4;
  if (players === 3) delete (glyphs as Partial<Record<Seat, GlyphRead[]>>).across;
  const fixed = checkByTotal(glyphs, read, players, game);
  const { scores, estimated } = estimateScores(read, players);
  if (fixed && !estimated.includes(fixed)) estimated.push(fixed);

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
