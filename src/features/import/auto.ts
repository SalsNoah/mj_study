/**
 * スクショから手牌・鳴き・ドラの位置を自動で見つける。範囲指定なしで読むための処理。
 * 牌の面は白〜クリーム色で彩度が低いので、その画素（面らしさ）の分布から探す。
 */
import { resample, type Img, type Rect } from './imageTools';

export type Located = {
  /** 手牌1枚の面の高さ（元画像のピクセル）。画面の拡大率の目安にも使う */
  tileH: number;
  hand: Rect | null;
  melds: Rect | null;
};

type Mask = { w: number; h: number; on: Uint8Array; scale: number };

/** 面らしい画素（明るく彩度が低い）を 1 にした縮小マスク */
export function faceMask(img: Img, maxW = 800): Mask {
  const scale = Math.min(1, maxW / img.width);
  const small = scale < 1 ? resample(img, Math.round(img.width * scale), Math.round(img.height * scale)) : img;
  const { width: w, height: h, data } = small;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    on[i] = lum > 165 && max > 0 && (max - min) / max < 0.28 ? 1 : 0;
  }
  return { w, h, on, scale };
}

/** 暗くて彩度の低い画素（天鳳の山の裏面など） */
export function darkMask(img: Img, scale: number): Uint8Array {
  const small =
    scale < 1 ? resample(img, Math.round(img.width * scale), Math.round(img.height * scale)) : img;
  const n = small.width * small.height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = small.data[i * 4]!;
    const g = small.data[i * 4 + 1]!;
    const b = small.data[i * 4 + 2]!;
    out[i] = 0.299 * r + 0.587 * g + 0.114 * b < 50 ? 1 : 0;
  }
  return out;
}

type Run = { x0: number; x1: number; top: number; bottom: number };

function blocks(flags: boolean[], mergeGap: number): Array<{ a: number; b: number }> {
  const out: Array<{ a: number; b: number }> = [];
  let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    const on = i < flags.length && flags[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      const last = out[out.length - 1];
      if (last && start - last.b <= mergeGap) last.b = i;
      else out.push({ a: start, b: i });
      start = -1;
    }
  }
  return out;
}

/** 行 y0..y1 の中で、面が縦に続く列のかたまりを牌の候補として返す（各かたまりの面の上下端つき） */
function tileRuns(m: Mask, y0: number, y1: number, reach: number): Run[] {
  const bandH = y1 - y0;
  const counts: number[] = [];
  for (let x = 0; x < m.w; x++) {
    let n = 0;
    for (let y = y0; y < y1; y++) n += m.on[y * m.w + x]!;
    counts.push(n);
  }
  // 絵柄の濃い牌（索子や九筒）は面の列が途切れるので、近くの列の最大値でならして1枚につなげる
  const k = Math.max(1, Math.round(bandH * 0.12));
  const flags = counts.map((_, x) => {
    let best = 0;
    for (let i = Math.max(0, x - k); i <= Math.min(m.w - 1, x + k); i++) best = Math.max(best, counts[i]!);
    return best >= bandH * 0.4;
  });
  return blocks(flags, 1).map(({ a, b }) => {
    const width = b - a;
    const yy0 = Math.max(0, y0 - reach);
    const yy1 = Math.min(m.h, y1 + reach);
    // 面が続く一番長い範囲を牌の高さとする。牌の中の細い線での途切れはつなぎ、
    // 大きく離れたもの（画面の縁の白い線など）は含めない
    const rows: boolean[] = [];
    for (let y = yy0; y < yy1; y++) {
      let n = 0;
      for (let x = a; x < b; x++) n += m.on[y * m.w + x]!;
      rows.push(n >= width * 0.3);
    }
    const segs = blocks(rows, Math.max(1, Math.round(bandH * 0.08)));
    const best = segs.reduce<{ a: number; b: number } | null>((p, c) => (!p || c.b - c.a > p.b - p.a ? c : p), null);
    return { x0: a, x1: b, top: best ? yy0 + best.a : y0, bottom: best ? yy0 + best.b : y1 };
  });
}

/**
 * 画面下の方で、面らしい画素が横にたくさん並ぶ帯を手牌の段とみなす。
 * その帯の中で背の高いかたまりが手牌、右側の背の低いかたまりが鳴いた牌。
 */
export function locateHand(img: Img): Located {
  const m = faceMask(img);
  const rowStart = Math.floor(m.h * 0.55);
  const flags: boolean[] = [];
  for (let y = rowStart; y < m.h; y++) {
    let n = 0;
    for (let x = 0; x < m.w; x++) n += m.on[y * m.w + x]!;
    flags.push(n >= m.w * 0.2);
  }
  const bands = blocks(flags, 3).map((b) => ({ a: b.a + rowStart, b: b.b + rowStart }));
  if (bands.length === 0) return { tileH: 0, hand: null, melds: null };
  const band = bands.reduce((p, c) => (c.b - c.a > p.b - p.a ? c : p));
  const bandH = band.b - band.a;
  const runs = tileRuns(m, band.a, band.b, Math.round(bandH * 0.3)).filter(
    (r) => r.x1 - r.x0 >= bandH * 0.35,
  );
  if (runs.length === 0) return { tileH: 0, hand: null, melds: null };

  // 隙間の小さいかたまり同士をまとめ、一番背の高い牌を含むまとまりを手牌とする（鳴いた牌は手牌より小さい）
  const groups: Run[][] = [];
  for (const r of runs) {
    const g = groups[groups.length - 1];
    if (g && r.x0 - g[g.length - 1]!.x1 <= bandH * 1.2) g.push(r);
    else groups.push([r]);
  }
  const heightOf = (r: Run) => r.bottom - r.top;
  const width = (g: Run[]) => g.reduce((n, r) => n + r.x1 - r.x0, 0);
  const tallest = Math.max(...runs.map(heightOf));
  const main = groups
    .filter((g) => g.some((r) => heightOf(r) >= tallest * 0.92))
    .reduce((p, c) => (width(c) > width(p) ? c : p));
  const refH = Math.max(...main.map(heightOf));
  const handRuns = main.filter((r) => heightOf(r) >= refH * 0.82);
  const maxH = Math.max(...handRuns.map((r) => r.bottom - r.top));
  const firstHand = handRuns[0]!;
  const lastHand = handRuns[handRuns.length - 1]!;
  const meldRuns = runs.filter(
    (r) => r.x0 > lastHand.x1 && r.bottom - r.top < refH * 0.82 && r.bottom - r.top >= refH * 0.45,
  );
  const s = 1 / m.scale;
  const rect = (rs: Run[]): Rect => {
    const x0 = Math.min(...rs.map((r) => r.x0));
    const x1 = Math.max(...rs.map((r) => r.x1));
    const top = Math.min(...rs.map((r) => r.top));
    const bottom = Math.max(...rs.map((r) => r.bottom));
    return { x: x0 * s, y: top * s, w: (x1 - x0) * s, h: (bottom - top) * s };
  };
  return {
    tileH: maxH * s,
    hand: rect([firstHand, ...handRuns.slice(1)]),
    melds: meldRuns.length ? rect(meldRuns) : null,
  };
}

export type Game = 'jantama' | 'tenhou';

export type CenterKey =
  | 'round'
  | 'seat'
  | 'turnText'
  | 'scoreSelf'
  | 'scoreRight'
  | 'scoreAcross'
  | 'scoreLeft';

/** 画面の中心からのずれと大きさ（手牌1枚の面の高さを1とした単位） */
type Box = { dx: number; dy: number; w: number; h: number };

/**
 * 点数・局・自風などの位置。どちらのゲームも画面の拡大率は手牌の大きさと一緒に変わるので、
 * 画面の中心から手牌の高さ何個分の位置かで表す（いただいたスクショで計測）。
 */
const CENTER_LAYOUT: Record<Game, Partial<Record<CenterKey, Box>>> = {
  jantama: {
    round: { dx: 0, dy: -0.915, w: 0.8, h: 0.3 },
    scoreSelf: { dx: 0, dy: -0.37, w: 0.85, h: 0.28 },
    scoreAcross: { dx: 0, dy: -1.21, w: 0.8, h: 0.26 },
    scoreRight: { dx: 0.62, dy: -0.82, w: 0.3, h: 0.55 },
    scoreLeft: { dx: -0.58, dy: -0.82, w: 0.3, h: 0.55 },
    seat: { dx: -0.96, dy: -0.14, w: 0.46, h: 0.36 },
    turnText: { dx: 1.78, dy: 1.945, w: 1.05, h: 0.34 },
  },
  tenhou: {
    round: { dx: 0.05, dy: -0.86, w: 1.5, h: 0.7 },
    scoreSelf: { dx: 0.08, dy: 0.0, w: 0.97, h: 0.55 },
    scoreAcross: { dx: 0.05, dy: -1.73, w: 1.54, h: 0.46 },
    scoreRight: { dx: 1.41, dy: -0.77, w: 0.72, h: 1.3 },
    scoreLeft: { dx: -1.48, dy: -0.77, w: 0.72, h: 1.3 },
    seat: { dx: -0.71, dy: 0.0, w: 0.46, h: 0.46 },
  },
};

export function centerRegions(game: Game, img: Img, tileH: number): Partial<Record<CenterKey, Rect>> {
  const out: Partial<Record<CenterKey, Rect>> = {};
  const cx = img.width / 2;
  const cy = img.height / 2;
  for (const [key, b] of Object.entries(CENTER_LAYOUT[game]) as Array<[CenterKey, Box]>) {
    const w = b.w * tileH;
    const h = b.h * tileH;
    out[key] = { x: cx + b.dx * tileH - w / 2, y: cy + b.dy * tileH - h / 2, w, h };
  }
  return out;
}

type Blob = { x0: number; y0: number; x1: number; y1: number; area: number };

/** 面らしい画素のつながり（牌の面の候補）を探す */
export function faceBlobs(m: Mask, yLimit: number): Blob[] {
  const seen = new Uint8Array(m.w * m.h);
  const out: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < m.w * yLimit; start++) {
    if (!m.on[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    const b: Blob = { x0: m.w, y0: m.h, x1: 0, y1: 0, area: 0 };
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % m.w;
      const y = (i - x) / m.w;
      b.area++;
      if (x < b.x0) b.x0 = x;
      if (y < b.y0) b.y0 = y;
      if (x + 1 > b.x1) b.x1 = x + 1;
      if (y + 1 > b.y1) b.y1 = y + 1;
      const nb = [i - 1, i + 1, i - m.w, i + m.w];
      for (const j of nb) {
        if (j < 0 || j >= m.w * yLimit || seen[j] || !m.on[j]) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === m.w - 1)) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    out.push(b);
  }
  return out;
}

/**
 * 天鳳：山（黒い裏面）に挟まれて表を向いている牌をドラ表示牌とみなす。
 * 山は横向き・縦向きのどちらもあるので、左右か上下の両側が黒いものを探す。
 */
export function locateWallDora(img: Img, tileH: number, handTop: number): Rect[] {
  const m = faceMask(img);
  const dark = darkMask(img, m.scale);
  const t = tileH * m.scale;
  const limit = Math.max(1, Math.min(m.h, Math.floor(handTop * m.scale - t * 0.3)));
  const darkFrac = (x0: number, y0: number, x1: number, y1: number) => {
    let n = 0;
    let d = 0;
    for (let y = Math.max(0, y0); y < Math.min(m.h, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(m.w, x1); x++) {
        n++;
        d += dark[y * m.w + x]!;
      }
    }
    return n ? d / n : 0;
  };
  const s = 1 / m.scale;
  // 絵柄の多い牌（九筒など）は面の画素がまばらになるので、面積の割合は緩めに見る
  const faces = faceBlobs(m, limit).filter((b) => {
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    const long = Math.max(bw, bh);
    const short = Math.min(bw, bh);
    return long >= t * 0.35 && long <= t * 1.1 && short >= t * 0.22 && b.area >= bw * bh * 0.2;
  });
  // 槓ドラのように表の牌が並ぶことがあるので、隣り合う面をまとめてから両端が山（黒）かを見る
  const used = new Set<Blob>();
  const out: Rect[] = [];
  for (const f of faces) {
    if (used.has(f)) continue;
    const fw = f.x1 - f.x0;
    const fh = f.y1 - f.y0;
    const horizontal = [f];
    const vertical = [f];
    for (const o of faces) {
      if (o === f) continue;
      const overlapY = Math.min(f.y1, o.y1) - Math.max(f.y0, o.y0);
      const overlapX = Math.min(f.x1, o.x1) - Math.max(f.x0, o.x0);
      if (overlapY > fh * 0.6 && Math.abs(o.x0 - f.x0) < fw * 4.5) horizontal.push(o);
      if (overlapX > fw * 0.6 && Math.abs(o.y0 - f.y0) < fh * 4.5) vertical.push(o);
    }
    const chainOk = (list: Blob[], axis: 'x' | 'y') => {
      const sorted = [...list].sort((a, b) => (axis === 'x' ? a.x0 - b.x0 : a.y0 - b.y0));
      const chain = [f];
      const idx = sorted.indexOf(f);
      for (let i = idx + 1; i < sorted.length; i++) {
        const prev = chain[chain.length - 1]!;
        const gap = axis === 'x' ? sorted[i]!.x0 - prev.x1 : sorted[i]!.y0 - prev.y1;
        if (gap > (axis === 'x' ? fw : fh) * 0.3) break;
        chain.push(sorted[i]!);
      }
      for (let i = idx - 1; i >= 0; i--) {
        const first = chain[0]!;
        const gap = axis === 'x' ? first.x0 - sorted[i]!.x1 : first.y0 - sorted[i]!.y1;
        if (gap > (axis === 'x' ? fw : fh) * 0.3) break;
        chain.unshift(sorted[i]!);
      }
      const x0 = Math.min(...chain.map((c) => c.x0));
      const x1 = Math.max(...chain.map((c) => c.x1));
      const y0 = Math.min(...chain.map((c) => c.y0));
      const y1 = Math.max(...chain.map((c) => c.y1));
      const g = Math.max(2, Math.round((axis === 'x' ? fw : fh) * 0.3));
      const ok =
        axis === 'x'
          ? darkFrac(x0 - g, y0, x0 - 1, y1) > 0.55 && darkFrac(x1 + 1, y0, x1 + g, y1) > 0.55
          : darkFrac(x0, y0 - g, x1, y0 - 1) > 0.55 && darkFrac(x0, y1 + 1, x1, y1 + g) > 0.55;
      return ok && chain.length <= 5 ? chain : null;
    };
    const chain = chainOk(horizontal, 'x') ?? chainOk(vertical, 'y');
    if (!chain) continue;
    for (const c of chain) {
      if (used.has(c)) continue;
      used.add(c);
      out.push({ x: c.x0 * s, y: c.y0 * s, w: (c.x1 - c.x0) * s, h: (c.y1 - c.y0) * s });
    }
  }
  return out;
}

/** 雀魂：左上のドラ表示欄で表を向いている牌（裏面は色付きなので面らしさで除ける） */
export function locatePanelDora(img: Img, tileH: number): Rect[] {
  const m = faceMask(img);
  const t = tileH * m.scale;
  const x1 = Math.floor(m.w * 0.25);
  const y1 = Math.floor(m.h * 0.2);
  const region: Mask = { w: m.w, h: m.h, on: m.on, scale: m.scale };
  const s = 1 / m.scale;
  return faceBlobs(region, y1)
    .filter((b) => {
      const bw = b.x1 - b.x0;
      const bh = b.y1 - b.y0;
      return b.x1 <= x1 && bh >= t * 0.25 && bh <= t * 0.9 && bw >= bh * 0.45 && bw <= bh * 1.1;
    })
    .sort((a, b) => a.x0 - b.x0)
    .map((b) => ({ x: b.x0 * s, y: b.y0 * s, w: (b.x1 - b.x0) * s, h: (b.y1 - b.y0) * s }));
}
