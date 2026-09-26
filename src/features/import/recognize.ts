import {
  brightFraction,
  crop,
  cropBrightRows,
  defaultRiverTileFraction,
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

export function readGlyphs(
  full: Img,
  rel: RelRect,
  bank: PreparedBank,
  mergeNarrow: boolean,
): GlyphCell[] {
  const region = crop(full, relToPx(rel, full));
  const { boxes, mask } = segmentGlyphs(region, mergeNarrow);
  return boxes.map((b) => {
    const feat = glyphFeature(mask, region.width, b);
    const match = classify(bank, feat);
    return {
      label: match.label,
      sure: !!match.label && match.score >= GLYPH_SURE,
      feat,
      width: b.w,
    };
  });
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
