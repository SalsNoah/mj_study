/** スクショ読み取り用の画像処理。DOMに依存しない純粋関数だけを置く。 */

export type Img = { width: number; height: number; data: Uint8ClampedArray };
export type Rect = { x: number; y: number; w: number; h: number };
export type Span = { x0: number; x1: number };

export function makeImg(width: number, height: number): Img {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function crop(img: Img, r: Rect): Img {
  const x0 = Math.min(img.width - 1, Math.max(0, Math.floor(r.x)));
  const y0 = Math.min(img.height - 1, Math.max(0, Math.floor(r.y)));
  const x1 = Math.max(x0 + 1, Math.min(img.width, Math.ceil(r.x + r.w)));
  const y1 = Math.max(y0 + 1, Math.min(img.height, Math.ceil(r.y + r.h)));
  const w = x1 - x0;
  const h = y1 - y0;
  const out = makeImg(w, h);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * img.width + x0) * 4;
    out.data.set(img.data.subarray(src, src + w * 4), y * w * 4);
  }
  return out;
}

export function luminance(img: Img): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  const d = img.data;
  for (let i = 0; i < n; i++) {
    out[i] = 0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!;
  }
  return out;
}

/** 大津の二値化しきい値 */
export function otsu(values: Float32Array): number {
  const hist = new Float64Array(256);
  for (const v of values) hist[Math.max(0, Math.min(255, Math.round(v)))]! += 1;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

/** 面積平均で縮小（拡大時は最近傍） */
export function resample(img: Img, w: number, h: number): Img {
  const out = makeImg(w, h);
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * img.height) / h);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * img.height) / h));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * img.width) / w);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * img.width) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * img.width + sx) * 4;
          r += img.data[i]!;
          g += img.data[i + 1]!;
          b += img.data[i + 2]!;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out.data[o] = r / n;
      out.data[o + 1] = g / n;
      out.data[o + 2] = b / n;
      out.data[o + 3] = 255;
    }
  }
  return out;
}

export function rotate(img: Img, dir: 'cw' | 'ccw'): Img {
  const out = makeImg(img.height, img.width);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const ox = dir === 'cw' ? img.height - 1 - y : y;
      const oy = dir === 'cw' ? x : img.width - 1 - x;
      const s = (y * img.width + x) * 4;
      const o = (oy * out.width + ox) * 4;
      out.data[o] = img.data[s]!;
      out.data[o + 1] = img.data[s + 1]!;
      out.data[o + 2] = img.data[s + 2]!;
      out.data[o + 3] = 255;
    }
  }
  return out;
}

export const TILE_FEAT_W = 12;
export const TILE_FEAT_H = 16;

/**
 * 牌の面の中で絵柄（文字・図柄）がある範囲。面より暗いか色の濃い画素を絵柄とみなし、
 * 縁の線や雀魂のオレンジの帯のように行・列いっぱいに伸びるものは除く。
 * 立体表示で牌の厚みが写るスクショと、平面の牌一覧とで位置をそろえるために使う。
 */
export function inkBox(tile: Img): Rect | null {
  const { width: w, height: h } = tile;
  const lum = luminance(tile);
  const sorted = Float32Array.from(lum).sort();
  const face = sorted[Math.floor(sorted.length * 0.85)]!;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = tile.data[i * 4]!;
    const g = tile.data[i * 4 + 1]!;
    const b = tile.data[i * 4 + 2]!;
    const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    ink[i] = lum[i]! < face * 0.62 || (sat > 0.35 && lum[i]! < face * 0.9) ? 1 : 0;
  }
  const mx = Math.round(w * 0.1);
  const my = Math.round(h * 0.06);
  const rowFull = (y: number) => {
    let n = 0;
    for (let x = 0; x < w; x++) n += ink[y * w + x]!;
    return n > w * 0.6;
  };
  const colFull = (x: number) => {
    let n = 0;
    for (let y = 0; y < h; y++) n += ink[y * w + x]!;
    return n > h * 0.6;
  };
  const skipRow = Array.from({ length: h }, (_, y) => y < my || y >= h - my || rowFull(y));
  const skipCol = Array.from({ length: w }, (_, x) => x < mx || x >= w - mx || colFull(x));
  // 縁の影など、ぽつぽつ散らばる画素は無視して、まとまって絵柄がある行・列だけを範囲にする
  const colCount = new Array<number>(w).fill(0);
  const rowCount = new Array<number>(h).fill(0);
  let total = 0;
  for (let y = 0; y < h; y++) {
    if (skipRow[y]) continue;
    for (let x = 0; x < w; x++) {
      if (skipCol[x] || !ink[y * w + x]) continue;
      colCount[x]!++;
      rowCount[y]!++;
      total++;
    }
  }
  const colMin = Math.max(2, h * 0.08);
  const rowMin = Math.max(2, w * 0.1);
  const xs = colCount.flatMap((n, x) => (n >= colMin ? [x] : []));
  const ys = rowCount.flatMap((n, y) => (n >= rowMin ? [y] : []));
  if (total < w * h * 0.01 || xs.length === 0 || ys.length === 0) return null;
  const x0 = xs[0]!;
  const x1 = xs[xs.length - 1]!;
  const y0 = ys[0]!;
  const y1 = ys[ys.length - 1]!;
  if (x1 - x0 < w * 0.15 || y1 - y0 < h * 0.15) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** 牌の特徴量：絵柄の範囲に合わせて 12x16 のRGBへ（赤五の判別のため色を残す）。白など絵柄のない牌は面全体 */
export function tileFeature(tile: Img): Uint8Array {
  const box = inkBox(tile);
  let inner: Img;
  if (box) {
    const px = Math.round(box.w * 0.06);
    const py = Math.round(box.h * 0.04);
    inner = crop(tile, { x: box.x - px, y: box.y - py, w: box.w + px * 2, h: box.h + py * 2 });
  } else {
    const ix = Math.round(tile.width * 0.12);
    const iy = Math.round(tile.height * 0.12);
    inner = crop(tile, { x: ix, y: iy, w: tile.width - ix * 2, h: tile.height - iy * 2 });
  }
  const small = resample(inner, TILE_FEAT_W, TILE_FEAT_H);
  const out = new Uint8Array(TILE_FEAT_W * TILE_FEAT_H * 3);
  for (let i = 0; i < TILE_FEAT_W * TILE_FEAT_H; i++) {
    out[i * 3] = small.data[i * 4]!;
    out[i * 3 + 1] = small.data[i * 4 + 1]!;
    out[i * 3 + 2] = small.data[i * 4 + 2]!;
  }
  return out;
}

/** 平均を引いて長さ1にしたベクトル（内積が相関係数になる） */
export function normalize(feat: Uint8Array): Float32Array {
  const n = feat.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += feat[i]!;
  mean /= n;
  const v = new Float32Array(n);
  let norm = 0;
  for (let i = 0; i < n; i++) {
    const d = feat[i]! - mean;
    v[i] = d;
    norm += d * d;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < n; i++) v[i]! /= norm;
  return v;
}

export function similarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -1;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

function runsOf(flags: boolean[], mergeGap: number): Span[] {
  const runs: Span[] = [];
  let start = -1;
  for (let x = 0; x <= flags.length; x++) {
    const on = x < flags.length && flags[x];
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      const prev = runs[runs.length - 1];
      if (prev && start - prev.x1 <= mergeGap) prev.x1 = x;
      else runs.push({ x0: start, x1: x });
      start = -1;
    }
  }
  return runs;
}

function splitRun(run: Span, k: number): Span[] {
  const step = (run.x1 - run.x0) / k;
  return Array.from({ length: k }, (_, i) => ({
    x0: Math.round(run.x0 + step * i),
    x1: Math.round(run.x0 + step * (i + 1)),
  }));
}

/**
 * 牌の境目は一定間隔で暗い線になるので、列ごとの明るさの自己相関が最大になる間隔を牌幅とみなす。
 * 周期がはっきりしないときは null。
 */
export function estimateTileWidth(img: Img, run: Span, minW: number, maxW: number): number | null {
  const lum = luminance(img);
  const { width: w, height: h } = img;
  const y0 = Math.floor(h * 0.15);
  const y1 = Math.max(y0 + 1, Math.ceil(h * 0.85));
  const len = run.x1 - run.x0;
  if (len < minW * 2.5) return null;
  const prof = new Float32Array(len);
  for (let x = 0; x < len; x++) {
    let s = 0;
    for (let y = y0; y < y1; y++) s += lum[y * w + run.x0 + x]!;
    prof[x] = s / (y1 - y0);
  }
  let mean = 0;
  for (const v of prof) mean += v;
  mean /= len;
  let variance = 0;
  for (let i = 0; i < len; i++) {
    prof[i]! -= mean;
    variance += prof[i]! * prof[i]!;
  }
  if (variance === 0) return null;
  let bestLag = -1;
  let best = -Infinity;
  const lo = Math.max(2, Math.floor(minW));
  const hi = Math.min(len - 1, Math.ceil(maxW));
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0;
    for (let i = 0; i + lag < len; i++) s += prof[i]! * prof[i + lag]!;
    const r = s / variance;
    if (r > best) {
      best = r;
      bestLag = lag;
    }
  }
  return best > 0.25 ? bestLag : null;
}

/** 指定枚数になる牌幅を、想定幅に一番近いものから探す */
function fitTileWidth(runs: Span[], count: number, expected: number): number | null {
  let best: number | null = null;
  for (let w = expected * 0.55; w <= expected * 1.8; w += 0.25) {
    const total = runs.reduce((n, r) => n + Math.max(1, Math.round((r.x1 - r.x0) / w)), 0);
    if (total === count && (best === null || Math.abs(w - expected) < Math.abs(best - expected))) {
      best = w;
    }
  }
  return best;
}

/**
 * 列ごとに「明るい画素が上下どこまで広がっているか」を枠の高さに対する割合で返す。
 * 牌は絵柄が濃くても上下の余白が明るいので、絵柄の量に左右されずに牌の縦幅がわかる。
 */
function columnSpans(img: Img): Float32Array {
  const lum = luminance(img);
  const thr = otsu(lum);
  const { width: w, height: h } = img;
  const out = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let top = -1;
    let bottom = -1;
    let n = 0;
    for (let y = 0; y < h; y++) {
      if (lum[y * w + x]! > thr) {
        if (top < 0) top = y;
        bottom = y;
        n++;
      }
    }
    out[x] = n >= Math.max(2, h * 0.05) ? (bottom - top + 1) / h : 0;
  }
  return out;
}

/**
 * 手牌・ドラの列を1枚ずつに分ける。牌がある列だけ明るい部分が縦に長く伸びるので、そこが続く区間を牌とみなし、
 * 区間の長さを牌幅で割って枚数を決める（ツモ牌の隙間があっても分けられる）。
 */
export function segmentTiles(
  img: Img,
  aspect: number,
  forcedCount?: number,
): { spans: Span[]; tileW: number } {
  const { height: h } = img;
  const spansByCol = columnSpans(img);
  const tallest = Math.max(...spansByCol, 0.01);
  const flags = [...spansByCol].map((s) => s >= tallest * 0.6);
  const expected = h * aspect;
  const runs = runsOf(flags, Math.max(1, Math.round(h * 0.02))).filter(
    (r) => r.x1 - r.x0 >= expected * 0.4,
  );
  if (runs.length === 0) return { spans: [], tileW: expected };

  let tileW = expected;
  const longest = runs.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a));
  const measured = estimateTileWidth(img, longest, expected * 0.55, expected * 1.4);
  if (measured) tileW = measured;
  if (forcedCount && forcedCount > 0) {
    const fitted = fitTileWidth(runs, forcedCount, tileW);
    if (fitted === null) {
      const whole = { x0: runs[0]!.x0, x1: runs[runs.length - 1]!.x1 };
      return { spans: splitRun(whole, forcedCount), tileW: (whole.x1 - whole.x0) / forcedCount };
    }
    tileW = fitted;
  }
  const spans = runs.flatMap((r) => splitRun(r, Math.max(1, Math.round((r.x1 - r.x0) / tileW))));
  return { spans, tileW };
}

/** 区間内で明るい行の範囲だけを切り出す（横向きの牌や上下の余白を除く） */
export function cropBrightRows(img: Img, span: Span): Img {
  const lum = luminance(img);
  const thr = otsu(lum);
  const { width: w, height: h } = img;
  let top = -1;
  let bottom = -1;
  const width = Math.max(1, span.x1 - span.x0);
  for (let y = 0; y < h; y++) {
    let bright = 0;
    for (let x = span.x0; x < span.x1; x++) if (lum[y * w + x]! > thr) bright++;
    if (bright / width > 0.3) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (top < 0) return crop(img, { x: span.x0, y: 0, w: width, h });
  return crop(img, { x: span.x0, y: top, w: width, h: bottom - top + 1 });
}

export type MeldSpan = Span & { rotated: boolean };

/**
 * 鳴いた牌の列を分ける。縦の牌は枠の高さいっぱいに明るく、横向きの牌は下の方だけ明るいので、
 * 列ごとの明るさの高さで縦・横を見分ける。暗い隙間が大きいところで組を区切る。
 */
export function segmentMelds(img: Img, aspect: number): MeldSpan[][] {
  const { width: w, height: h } = img;
  const ext = [...columnSpans(img)];
  // 横向きの牌の高さ ≒ 縦の牌の幅（縦の高さ×aspect）。一番高い列を縦の牌として相対的に判定する
  const tallest = Math.max(...ext, 0.01);
  const uprightMin = tallest * ((1 + aspect) / 2);
  const presentMin = tallest * aspect * 0.35;
  const cls: Array<'u' | 'r' | '-'> = ext.map((e) => (e >= uprightMin ? 'u' : e >= presentMin ? 'r' : '-'));
  type Seg = { c: 'u' | 'r' | '-'; x0: number; x1: number };
  const segs: Seg[] = [];
  for (let x = 0; x < w; x++) {
    const last = segs[segs.length - 1];
    if (last && last.c === cls[x]) last.x1 = x + 1;
    else segs.push({ c: cls[x]!, x0: x, x1: x + 1 });
  }
  const minSeg = Math.max(2, Math.round(h * 0.04));
  const merged: Seg[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s.x1 - s.x0 < minSeg) last.x1 = s.x1;
    else if (last && last.c === s.c) last.x1 = s.x1;
    else merged.push({ ...s });
  }

  const uprightW = h * aspect;
  const groupGap = Math.max(2, Math.round(uprightW * 0.12));
  const groups: MeldSpan[][] = [];
  let current: MeldSpan[] = [];
  for (const s of merged) {
    const len = s.x1 - s.x0;
    if (s.c === '-') {
      if (len > groupGap && current.length) {
        groups.push(current);
        current = [];
      }
      continue;
    }
    const unit = s.c === 'u' ? uprightW : h;
    const k = Math.max(1, Math.round(len / unit));
    if (len < unit * 0.45) continue;
    for (const part of splitRun(s, k)) current.push({ ...part, rotated: s.c === 'r' });
  }
  if (current.length) groups.push(current);
  return groups;
}

export type GlyphBox = Rect;

export type TextTone = 'bright' | 'dark' | 'auto';

/**
 * 点数や「東1局」などの文字を1文字ずつに分ける。tone で文字の明暗を指定する（auto は面積の少ない方）。
 * mergeNarrow は漢字（北など左右に分かれる字）を1文字にまとめるときだけ使う。
 */
export function segmentGlyphs(
  img: Img,
  mergeNarrow: boolean,
  splitWide = true,
  tone: TextTone = 'auto',
): { boxes: GlyphBox[]; mask: Uint8Array; ink: Float32Array } {
  const lum = luminance(img);
  const thr = otsu(lum);
  const { width: w, height: h } = img;
  let bright = 0;
  let sumB = 0;
  let sumD = 0;
  for (const v of lum) {
    if (v > thr) {
      bright++;
      sumB += v;
    } else sumD += v;
  }
  const meanB = bright ? sumB / bright : 255;
  const meanD = lum.length - bright ? sumD / (lum.length - bright) : 0;

  const build = (textIsBright: boolean) => {
    const mask = new Uint8Array(lum.length);
    for (let i = 0; i < lum.length; i++) mask[i] = (lum[i]! > thr) === textIsBright ? 1 : 0;
    // 下線や枠の線は文字ではないので消す。横は文字1〜2個分より長い線、縦は上端から下端まで届く線
    const maxRun = Math.max(w * 0.35, h * 1.5);
    for (let y = 0; y < h; y++) {
      let start = -1;
      for (let x = 0; x <= w; x++) {
        const on = x < w && mask[y * w + x] === 1;
        if (on && start < 0) start = x;
        if (!on && start >= 0) {
          if (x - start > maxRun) for (let i = start; i < x; i++) mask[y * w + i] = 0;
          start = -1;
        }
      }
    }
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let y = 0; y < h; y++) n += mask[y * w + x]!;
      if (n >= h - 1) for (let y = 0; y < h; y++) mask[y * w + x] = 0;
    }
    // 文字らしさ（0〜1）。二値化で潰れる細部（3と8の違いなど）を特徴量に残すため濃淡のまま持つ
    const fg = textIsBright ? meanB : meanD;
    const bg = textIsBright ? meanD : meanB;
    const span = fg - bg || 1;
    const ink = new Float32Array(lum.length);
    for (let i = 0; i < lum.length; i++) ink[i] = mask[i] ? Math.max(0, Math.min(1, (lum[i]! - bg) / span)) : 0;
    return { boxes: glyphBoxes(mask, w, h, mergeNarrow, splitWide), mask, ink };
  };

  return build(tone === 'auto' ? bright < lum.length / 2 : tone === 'bright');
}

/** つながった画素のかたまりを文字の部品として取り出す（上下に重なる部品は1文字にまとめる） */
function glyphBoxes(
  mask: Uint8Array,
  w: number,
  h: number,
  mergeNarrow: boolean,
  splitWide: boolean,
): GlyphBox[] {
  const seen = new Uint8Array(w * h);
  const parts: Array<{ x0: number; y0: number; x1: number; y1: number; area: number }> = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    seen[s] = 1;
    stack.push(s);
    const p = { x0: w, y0: h, x1: 0, y1: 0, area: 0 };
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      p.area++;
      if (x < p.x0) p.x0 = x;
      if (y < p.y0) p.y0 = y;
      if (x + 1 > p.x1) p.x1 = x + 1;
      if (y + 1 > p.y1) p.y1 = y + 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (seen[j] || !mask[j]) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (p.area >= Math.max(3, h * h * 0.004)) parts.push(p);
  }
  parts.sort((a, b) => a.x0 - b.x0);

  // 横に大きく重なる部品（「局」の上下や「5」の頭など）は同じ文字
  const merged: typeof parts = [];
  for (const p of parts) {
    const hit = merged.find(
      (q) => Math.min(q.x1, p.x1) - Math.max(q.x0, p.x0) >= Math.min(q.x1 - q.x0, p.x1 - p.x0) * 0.5,
    );
    if (hit) {
      hit.x0 = Math.min(hit.x0, p.x0);
      hit.y0 = Math.min(hit.y0, p.y0);
      hit.x1 = Math.max(hit.x1, p.x1);
      hit.y1 = Math.max(hit.y1, p.y1);
      hit.area += p.area;
    } else merged.push({ ...p });
  }
  merged.sort((a, b) => a.x0 - b.x0);

  let boxes: GlyphBox[] = merged
    .map((p) => ({ x: p.x0, y: p.y0, w: p.x1 - p.x0, h: p.y1 - p.y0 }))
    .filter((b) => b.h >= h * 0.12);

  if (mergeNarrow) {
    const joined: GlyphBox[] = [];
    for (const b of boxes) {
      const last = joined[joined.length - 1];
      if (
        last &&
        b.x - (last.x + last.w) < h * 0.2 &&
        last.w < h * 0.5 &&
        b.w < h * 0.5 &&
        b.x + b.w - last.x < h * 1.05
      ) {
        const x1 = Math.max(last.x + last.w, b.x + b.w);
        const y1 = Math.max(last.y + last.h, b.y + b.h);
        last.y = Math.min(last.y, b.y);
        last.w = x1 - last.x;
        last.h = y1 - last.y;
      } else joined.push({ ...b });
    }
    boxes = joined;
  }
  if (mergeNarrow || !splitWide || boxes.length === 0) return boxes;

  // 数字どうしが接して1つになったものは、同じ範囲の1文字分の幅で分ける（「1」は細いので基準にしない）
  const tall = boxes.filter((b) => b.h >= h * 0.4 && b.w >= b.h * 0.35);
  const widths = tall.map((b) => b.w).sort((a, b) => a - b);
  const unit = widths.length >= 2 ? widths[Math.floor(widths.length / 2)]! : null;
  const out: GlyphBox[] = [];
  for (const b of boxes) {
    const k =
      unit && b.w > unit * 1.6
        ? Math.round(b.w / unit)
        : !unit && b.w > b.h * 1.3
          ? Math.round(b.w / (b.h * 0.7))
          : 1;
    for (let i = 0; i < Math.max(1, k); i++) {
      const x0 = Math.round(b.x + (b.w * i) / k);
      const x1 = Math.round(b.x + (b.w * (i + 1)) / k);
      out.push({ x: x0, y: b.y, w: Math.max(1, x1 - x0), h: b.h });
    }
  }
  return out;
}

/** 天鳳の点数の末尾の小さい「00」やカンマなど、背の低い文字を除く（先頭のマイナスは残す） */
export function dropSmallGlyphs(boxes: GlyphBox[]): GlyphBox[] {
  if (boxes.length === 0) return boxes;
  const tallest = Math.max(...boxes.map((b) => b.h));
  return boxes.filter((b, i) => b.h >= tallest * 0.72 || (i === 0 && b.w >= b.h * 1.8));
}

export const GLYPH_W = 16;
export const GLYPH_H = 24;

/**
 * 文字の特徴量：文字らしさの濃淡（ink は 0〜1）を 16x24 の枠いっぱいに引き伸ばす。
 * 雀魂では左右の人の点数が縦長に詰まった字体になるので、縦横比は捨てて形だけを比べる。
 */
export function glyphFeature(ink: Float32Array | Uint8Array, width: number, box: GlyphBox): Uint8Array {
  const out = new Uint8Array(GLYPH_W * GLYPH_H);
  const dw = GLYPH_W;
  const dh = GLYPH_H;
  const ox = 0;
  const oy = 0;
  for (let y = 0; y < dh; y++) {
    const sy0 = box.y + Math.floor((y * box.h) / dh);
    const sy1 = Math.max(sy0 + 1, box.y + Math.floor(((y + 1) * box.h) / dh));
    for (let x = 0; x < dw; x++) {
      const sx0 = box.x + Math.floor((x * box.w) / dw);
      const sx1 = Math.max(sx0 + 1, box.x + Math.floor(((x + 1) * box.w) / dw));
      let on = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          on += ink[sy * width + sx]!;
          n++;
        }
      }
      out[(oy + y) * GLYPH_W + ox + x] = Math.round((on / n) * 255);
    }
  }
  return out;
}
