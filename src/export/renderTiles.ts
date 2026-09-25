import type { TileCode } from '@/domain/types';
import type { Meld } from '@/domain/types';
import { tileLabel, isRed, tileRank, tileSuit } from '@/domain/tiles';

export type RenderHandInput = {
  concealed: TileCode[];
  drawn: TileCode | null;
  melds: Meld[];
  doraIndicators: TileCode[];
};

function drawTile(
  ctx: CanvasRenderingContext2D,
  code: TileCode,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { back?: boolean; rotated?: boolean },
) {
  ctx.save();
  if (opts?.rotated) {
    ctx.translate(x + h / 2, y + w / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-w / 2, -h / 2);
  } else {
    ctx.translate(x, y);
  }

  if (opts?.back) {
    ctx.fillStyle = '#1B4D3E';
    roundRect(ctx, 0, 0, w, h, 6);
    ctx.fill();
    ctx.restore();
    return;
  }

  const red = isRed(code);
  ctx.fillStyle = red ? '#FFF5F5' : '#FFFEFA';
  ctx.strokeStyle = '#C9C2B2';
  ctx.lineWidth = 2;
  roundRect(ctx, 0, 0, w, h, 6);
  ctx.fill();
  ctx.stroke();

  const suit = tileSuit(code);
  const rank = tileRank(code);
  const color =
    suit === 'm' || (suit === 'z' && rank === 7) || red ? '#C62828' :
    suit === 'p' ? '#1565C0' :
    suit === 's' || (suit === 'z' && rank === 6) ? '#2E7D32' : '#222';

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.floor(w * 0.38)}px serif`;

  if (suit === 'z') {
    const marks = ['東', '南', '西', '北', '白', '發', '中'];
    if (rank === 5) {
      ctx.strokeStyle = '#999';
      ctx.strokeRect(w * 0.22, h * 0.22, w * 0.56, h * 0.56);
    } else {
      ctx.fillText(marks[rank - 1]!, w / 2, h / 2);
    }
  } else {
    ctx.fillText(String(rank), w / 2, h * 0.36);
    ctx.font = `700 ${Math.floor(w * 0.28)}px serif`;
    ctx.fillText(suit === 'm' ? '萬' : suit === 'p' ? '筒' : '索', w / 2, h * 0.7);
    if (red) {
      ctx.beginPath();
      ctx.fillStyle = '#C62828';
      ctx.arc(w * 0.78, h * 0.18, w * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
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
export function renderHandPng(input: RenderHandInput): { blob: Blob; dataUrl: string; filename: string } {
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
      drawTile(ctx, code, x, y, tileW, tileH);
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
        drawTile(ctx, meld.tiles[0]!, x, y, tw, th, { back: true });
        x += tw + 2;
        drawTile(ctx, meld.tiles[1]!, x, y, tw, th);
        x += tw + 2;
        drawTile(ctx, meld.tiles[2]!, x, y, tw, th);
        x += tw + 2;
        drawTile(ctx, meld.tiles[3]!, x, y, tw, th, { back: true });
        x += tw + 14;
      } else {
        meld.tiles.forEach((code, i) => {
          const rotated = meld.calledIndex === i;
          drawTile(ctx, code, x, y, tw, th, { rotated });
          x += (rotated ? th : tw) + 2;
        });
        x += 12;
      }
    }
    y += tileH + 20;
  }

  let x = pad;
  for (const code of input.concealed) {
    drawTile(ctx, code, x, y, tileW, tileH);
    x += tileW + gap;
  }
  if (input.drawn) {
    x += 18;
    drawTile(ctx, input.drawn, x, y, tileW, tileH);
  }

  // accessibility note in pixel data only via aria on UI; no private text here
  void tileLabel;

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
