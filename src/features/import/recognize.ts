import {
  brightFraction,
  crop,
  cropBrightRows,
  defaultRiverTileFraction,
  dropSmallGlyphs,
  glyphFeature,
  rotate,
  segmentGlyphs,
  segmentMelds,
  segmentTiles,
  tileFeature,
  type Img,
  type Rect,
} from './imageTools';
import type { RelRect } from './profiles';
import { classify, type PreparedBank } from './templates';

/** 見本との一致度がこれ以上で、2位との差も十分なら確定扱い */
const TILE_SURE = 0.8;
const TILE_MARGIN = 0.03;
const GLYPH_SURE = 0.75;

export type TileCell = {
  label: string | null;
  sure: boolean;
  feat: Uint8Array;
  preview: string;
  rotated: boolean;
};

export type GlyphCell = {
  label: string | null;
  sure: boolean;
  feat: Uint8Array;
  width: number;
};

export async function loadImage(file: Blob): Promise<{ img: Img; url: string }> {
  const url = URL.createObjectURL(file);
  const el = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('画像を読み込めません'));
    i.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = el.naturalWidth;
  canvas.height = el.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('画像を処理できません');
  ctx.drawImage(el, 0, 0);
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { img: { width: d.width, height: d.height, data: d.data }, url };
}

export function toDataUrl(img: Img): string {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvas.toDataURL('image/png');
}

export function relToPx(r: RelRect, img: Img): Rect {
  return { x: r.x * img.width, y: r.y * img.height, w: r.w * img.width, h: r.h * img.height };
}

function readOne(tile: Img, bank: PreparedBank, rotated: boolean): TileCell {
  const options = rotated ? [rotate(tile, 'cw'), rotate(tile, 'ccw')] : [tile];
  let best: { feat: Uint8Array; match: ReturnType<typeof classify> } | null = null;
  for (const o of options) {
    const feat = tileFeature(o);
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
  };
}

export function readTiles(
  full: Img,
  rel: RelRect,
  bank: PreparedBank,
  aspect: number,
  forcedCount?: number,
): { cells: TileCell[]; tileW: number; boxH: number } {
  const region = crop(full, relToPx(rel, full));
  const { spans, tileW } = segmentTiles(region, aspect, forcedCount);
  const cells = spans.map((s) => readOne(cropBrightRows(region, s), bank, false));
  return { cells, tileW, boxH: region.height };
}

export function readMelds(full: Img, rel: RelRect, bank: PreparedBank, aspect: number): TileCell[][] {
  const region = crop(full, relToPx(rel, full));
  return segmentMelds(region, aspect).map((group) =>
    group.map((s) => readOne(cropBrightRows(region, s), bank, s.rotated)),
  );
}

/** 画像を時計回りに回す角度。自分以外の点数は、その人の向きに合わせて横向き・逆さまで表示される */
export type Turn = 0 | 90 | 180 | 270;

function turnImage(img: Img, t: Turn): Img {
  if (t === 90) return rotate(img, 'cw');
  if (t === 270) return rotate(img, 'ccw');
  if (t === 180) return rotate(rotate(img, 'cw'), 'cw');
  return img;
}

/**
 * 文字を読む。turns に複数の向きを渡すと、見本との一致度の平均が一番高い向きを使う
 * （見本がまだないときは先頭の向き）。
 */
export function readGlyphs(
  full: Img,
  rel: RelRect,
  bank: PreparedBank,
  opts: { mergeNarrow: boolean; turns?: Turn[]; dropSmall?: boolean },
): { cells: GlyphCell[]; turn: Turn; score: number } {
  const base = crop(full, relToPx(rel, full));
  let best: { cells: GlyphCell[]; turn: Turn; score: number } | null = null;
  for (const t of opts.turns ?? [0]) {
    const region = turnImage(base, t);
    const seg = segmentGlyphs(region, opts.mergeNarrow);
    const boxes = opts.dropSmall ? dropSmallGlyphs(seg.boxes) : seg.boxes;
    let total = 0;
    const cells = boxes.map((b) => {
      const feat = glyphFeature(seg.ink, region.width, b);
      const match = classify(bank, feat);
      total += match.label ? match.score : 0;
      return {
        label: match.label,
        sure: !!match.label && match.score >= GLYPH_SURE,
        feat,
        width: b.w,
      };
    });
    const score = cells.length ? total / cells.length : 0;
    if (!best || score > best.score) best = { cells, turn: t, score };
  }
  return best!;
}

export function readRiver(
  full: Img,
  rel: RelRect,
  tileFraction: number | null,
): { count: number; brightFrac: number } {
  const region = crop(full, relToPx(rel, full));
  const brightFrac = brightFraction(region);
  const per = tileFraction ?? defaultRiverTileFraction(region);
  return { count: Math.max(0, Math.round(brightFrac / per)), brightFrac };
}
