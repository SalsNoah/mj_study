import type { TileCode } from '@/domain/types';
import type { Meld } from '@/domain/types';
import { tileImageUrl } from '@/components/tileImages';

export type RenderHandInput = {
  concealed: TileCode[];
  drawn: TileCode | null;
  melds: Meld[];
  doraIndicators: TileCode[];
};

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(url: string): Promise<HTMLImageElement> {
  const hit = imageCache.get(url);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`牌画像を読み込めません: ${url}`));
    img.src = url;
  });
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  code: TileCode,
  x: number,
  y: number,
  w: number,
  h: number,
  images: Map<string, HTMLImageElement>,
  opts?: { back?: boolean; rotated?: boolean },
) {
  if (opts?.back) {
    ctx.fillStyle = '#1B4D3E';
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    return;
  }
  if (opts?.rotated) {
    const img = images.get(tileImageUrl(code, true));
    if (img) ctx.drawImage(img, x, y, h, w);
    return;
  }
  const img = images.get(tileImageUrl(code, false));
  if (img) ctx.drawImage(img, x, y, w, h);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 牌姿PNG。解説・メモ・参考画像・学習履歴は含めない。 */
export async function renderHandPng(input: RenderHandInput): Promise<{ blob: Blob; dataUrl: string; filename: string }> {
  const tileW = 72;
  const tileH = 96;
  const pad = 40;
  const gap = 6;

  const meldWidth = input.melds.reduce((acc, m) => acc + m.tiles.length * (tileW * 0.85) + 16, 0);
  const mainWidth =
    input.concealed.length * (tileW + gap) + (input.drawn ? tileW + 24 : 0);
  const doraWidth = input.doraIndicators.length * (tileW + gap);
  const contentW = Math.max(meldWidth, mainWidth, doraWidth, 400);
  const width = Math.max(1600, contentW + pad * 2);
  const height = Math.max(
    500,
    pad * 2 +
      (input.doraIndicators.length ? tileH + 40 : 0) +
      (input.melds.length ? tileH + 24 : 0) +
      tileH +
      40,
  );

  const urls = new Set<string>();
  const collect = (code: TileCode, sideways = false) => urls.add(tileImageUrl(code, sideways));
  for (const code of input.doraIndicators) collect(code);
  for (const code of input.concealed) collect(code);
  if (input.drawn) collect(input.drawn);
  for (const meld of input.melds) {
    meld.tiles.forEach((code, i) => {
      if (meld.type === 'closedKan' && (i === 0 || i === 3)) return;
      collect(code, meld.type !== 'closedKan' && meld.calledIndex === i);
    });
  }
  const images = new Map<string, HTMLImageElement>();
  await Promise.all([...urls].map(async (url) => {
    images.set(url, await loadImage(url));
  }));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  let y = pad;
  if (input.doraIndicators.length) {
    ctx.fillStyle = '#333';
    ctx.font = '600 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('ドラ表示牌', pad, y);
    y += 12;
    let x = pad;
    for (const code of input.doraIndicators) {
      drawTile(ctx, code, x, y, tileW, tileH, images);
      x += tileW + gap;
    }
    y += tileH + 28;
  }

  if (input.melds.length) {
    let x = pad;
    for (const meld of input.melds) {
      const tw = tileW * 0.85;
      const th = tileH * 0.85;
      if (meld.type === 'closedKan') {
        drawTile(ctx, meld.tiles[0]!, x, y, tw, th, images, { back: true });
        x += tw + 2;
        drawTile(ctx, meld.tiles[1]!, x, y, tw, th, images);
        x += tw + 2;
        drawTile(ctx, meld.tiles[2]!, x, y, tw, th, images);
        x += tw + 2;
        drawTile(ctx, meld.tiles[3]!, x, y, tw, th, images, { back: true });
        x += tw + 14;
      } else {
        meld.tiles.forEach((code, i) => {
          const rotated = meld.calledIndex === i;
          drawTile(ctx, code, x, y, tw, th, images, { rotated });
          x += (rotated ? th : tw) + 2;
        });
        x += 12;
      }
    }
    y += tileH + 20;
  }

  let x = pad;
  for (const code of input.concealed) {
    drawTile(ctx, code, x, y, tileW, tileH, images);
    x += tileW + gap;
  }
  if (input.drawn) {
    x += 18;
    drawTile(ctx, input.drawn, x, y, tileW, tileH, images);
  }

  // accessibility note in pixel data only via aria on UI; no private text here
  const dataUrl = canvas.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'image/png' });
  const d = new Date();
  const filename = `mahjong_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}.png`;
  return { blob, dataUrl, filename };
}

export async function compressImageFile(
  file: File,
): Promise<
  | { ok: true; dataUrl: string; width: number; height: number }
  | { ok: false; reason: string; previewDataUrl?: string }
> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { ok: false, reason: 'JPEG / PNG / WebP のみ添付できます' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, reason: '元ファイルは10MB以下にしてください' };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, reason: '画像の読み込みに失敗しました' };
  }

  const longEdge = Math.max(bitmap.width, bitmap.height);
  let scale = longEdge > 1280 ? 1280 / longEdge : 1;
  let quality = 0.82;
  let dataUrl = '';
  let w = 0;
  let h = 0;

  for (let attempt = 0; attempt < 8; attempt++) {
    w = Math.max(1, Math.round(bitmap.width * scale));
    h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, reason: '画像変換に失敗しました' };
    ctx.drawImage(bitmap, 0, 0, w, h);
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    const bytes = Math.ceil(((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3) / 4);
    if (bytes <= 150 * 1024) {
      return { ok: true, dataUrl, width: w, height: h };
    }
    quality -= 0.1;
    if (quality < 0.45) {
      scale *= 0.85;
      quality = 0.75;
    }
  }

  return {
    ok: false,
    reason: '150KiB以下に圧縮できませんでした。別の画像を選ぶか中止してください',
    previewDataUrl: dataUrl,
  };
}
