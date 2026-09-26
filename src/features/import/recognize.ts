import type { Img } from './imageTools';

export type TileCell = {
  label: string | null;
  sure: boolean;
  feat: Uint8Array;
  preview: string;
  rotated: boolean;
};

/** 画像を時計回りに回す角度。自分以外の点数や鳴いた牌は横向き・逆さまで表示される */
export type Turn = 0 | 90 | 180 | 270;

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
