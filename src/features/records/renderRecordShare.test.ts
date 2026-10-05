import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRecordShareSnapshot } from '@/domain/recordShare';
import { renderRecordShareImage } from './renderRecordShare';

let printed: { text: string; x: number; y: number; width: number; font: string }[];
let ctx: CanvasRenderingContext2D;
beforeEach(() => {
  printed = [];
  ctx = {
    fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    font: '', textAlign: 'left', fillStyle: '',
    measureText(this: CanvasRenderingContext2D, value: string) { return { width: value.length * Number(this.font.match(/ (\d+)px/)?.[1] ?? 36) * .65 }; },
    fillText(this: CanvasRenderingContext2D, value: string, x: number, y: number) { printed.push({ text: value, x, y, width: this.measureText(value).width, font: this.font }); },
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['png'], { type: 'image/png' })));
});
afterEach(() => vi.restoreAllMocks());

it('exports a real PNG blob contract and draws only the date and six approved counts', async () => {
  const snapshot = createRecordShareSnapshot({ '2000-01-01': { tested: 100, confirmed: 200 }, '2026-10-05': { tested: 4, confirmed: 2 } }, [], new Date(2026, 9, 5, 12));
  const result = await renderRecordShareImage(snapshot);
  expect(result.blob.type).toBe('image/png'); expect(result.fileName).toBe('mahjong-study-records-2026-10-05.png');
  expect(printed.map((item) => item.text)).toEqual(['麻雀学習帳', '2026/10/05 の学習記録', '今日', 'テスト', '4', '回', '確認', '2', '回', '教材学習', '0', '回', '累計', 'テスト', '104', '回', '確認', '202', '回', '教材学習', '0', '回', '#麻雀学習帳', '累計は表示期間より前の記録を含みます']);
  expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
});

it('fits large integer counts in the numeric column without clipping or losing digits', async () => {
  const snapshot = createRecordShareSnapshot({ '2026-10-05': { tested: Number.MAX_SAFE_INTEGER, confirmed: 999999999 } }, [], new Date(2026, 9, 5));
  await renderRecordShareImage(snapshot);
  const big = printed.filter((item) => item.text === '9,007,199,254,740,991');
  expect(big).toHaveLength(2);
  for (const item of big) { expect(item.width).toBeLessThanOrEqual(560); expect(item.x - item.width).toBeGreaterThanOrEqual(355); }
  expect(printed.every((item) => item.y < 1080 && item.x < 1080)).toBe(true);
});

it('reports missing canvas and PNG encoding failures instead of returning empty share files', async () => {
  const snapshot = createRecordShareSnapshot(undefined, undefined, new Date(2026, 9, 5));
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
  await expect(renderRecordShareImage(snapshot)).rejects.toThrow('canvas is unavailable');
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => callback(null));
  await expect(renderRecordShareImage(snapshot)).rejects.toThrow('export failed');
});
