/** 問題画像・解説画像をブラウザ内で圧縮する。 */
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
