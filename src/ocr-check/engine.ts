import { autoRead, prepareModel, type Model, type AutoResult } from '@/features/import/autoRead';
import { inferMeld } from '@/features/import/parse';
import type { Img } from '@/features/import/imageTools';
import type { Prediction } from './metrics';

declare const __OCR_CODE_REVISION__: string;
export const CODE_REVISION = __OCR_CODE_REVISION__;
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PIXELS = 24_000_000;
export const MAX_SIDE = 1920;
export const sha256 = async (buffer: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map((n) => n.toString(16).padStart(2, '0')).join('');
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 35));

export async function readModel(signal?: AbortSignal) {
  const response = await fetch(new URL(`${import.meta.env.BASE_URL}import-model.json?v=4`, location.href), { cache: 'no-store', credentials: 'omit', signal });
  if (!response.ok) throw new Error('同梱モデルを読み込めません。通信状態を確認して再選択してください。');
  const buffer = await response.arrayBuffer();
  const parsed = JSON.parse(new TextDecoder().decode(buffer)) as { version: number; games: Model };
  if (parsed.version !== 4 || !parsed.games?.jantama?.tiles || !parsed.games?.tenhou?.tiles) throw new Error('対応する認識モデルではありません。');
  return { banks: prepareModel(parsed.games, {}), version: parsed.version, sha256: await sha256(buffer) };
}

/** Browser image decoding applies EXIF orientation; draw the displayed, oriented bitmap. */
export async function decode(file: File, url: string, signal: AbortSignal) {
  if (file.size === 0 || file.size > MAX_BYTES) throw new Error('画像は空でない20 MiB以下のPNG・JPEG・WebPを選んでください。');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('PNG・JPEG・WebP画像を選んでください。HEICはJPEG等へ変換してください。');
  const element = new Image();
  await new Promise<void>((resolve, reject) => {
    const stop = () => { element.src = ''; reject(new DOMException('中断しました', 'AbortError')); };
    const clean = () => signal.removeEventListener('abort', stop);
    element.onload = () => { clean(); resolve(); };
    element.onerror = () => { clean(); reject(new Error('画像を読み込めません。別の画像を選んでください。')); };
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) { clean(); stop(); return; }
    element.src = url;
  });
  const width = element.naturalWidth, height = element.naturalHeight;
  if (!width || !height || width * height > MAX_PIXELS) throw new Error('画像は2400万画素以下にしてください。');
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('画像処理を利用できません。');
  ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { img: { width: d.width, height: d.height, data: d.data } as Img, width, height, scale };
}

export function summarize(result: AutoResult | null): Prediction {
  return { hand: result?.hand.map((c) => c.label ?? '?') ?? [], melds: result?.melds.map((cells) => {
    const inferred = inferMeld(cells);
    return { type: inferred.ok ? inferred.meld.type : null, tiles: cells.map((c) => c.label ?? '?') };
  }) ?? [] };
}

export async function recognizeFile(file: File, url: string, signal: AbortSignal) {
  const decoded = await decode(file, url, signal);
  signal.throwIfAborted();
  const model = await readModel(signal);
  const imageSha256 = await sha256(await file.arrayBuffer());
  signal.throwIfAborted(); await pause(); signal.throwIfAborted();
  const raw = autoRead(decoded.img, model.banks);
  // Let queued cancel/reselect events run before publishing synchronous OCR output.
  await pause(); signal.throwIfAborted();
  return { raw, prediction: summarize(raw), image: { name: file.name, bytes: file.size, mime: file.type, sha256: imageSha256, width: decoded.width, height: decoded.height, processedWidth: decoded.img.width, processedHeight: decoded.img.height, scale: decoded.scale, orientation: 'browser EXIF applied' }, model: { version: model.version, sha256: model.sha256, localBank: 'empty' }, codeRevision: CODE_REVISION, recognizedAt: new Date().toISOString() };
}
export type Recognition = Awaited<ReturnType<typeof recognizeFile>>;
