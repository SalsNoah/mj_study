import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRecordShareSnapshot } from '@/domain/recordShare';
import { renderRecordShareImage } from './renderRecordShare';
import type { ThemeId } from '@/app/theme';

let printed: { text: string; x: number; y: number; width: number; font: string; color: string }[];
let ctx: CanvasRenderingContext2D;
let loaded: string[];
let failArt: boolean;
beforeEach(() => {
  printed = [];
  loaded = []; failArt = false;
  vi.stubGlobal('Image', class {
    naturalWidth = 1536; naturalHeight = 1024;
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    set src(value: string) { loaded.push(value); queueMicrotask(() => failArt ? this.onerror?.() : this.onload?.()); }
  });
  ctx = {
    fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    arcTo: vi.fn(), closePath: vi.fn(), save: vi.fn(), restore: vi.fn(), fill: vi.fn(), clip: vi.fn(), drawImage: vi.fn(),
    translate: vi.fn(), scale: vi.fn(), bezierCurveTo: vi.fn(), createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    font: '', textAlign: 'left', fillStyle: '',
    measureText(this: CanvasRenderingContext2D, value: string) { return { width: value.length * Number(this.font.match(/ (\d+)px/)?.[1] ?? 36) * .65 }; },
    fillText(this: CanvasRenderingContext2D, value: string, x: number, y: number) { printed.push({ text: value, x, y, width: this.measureText(value).width, font: this.font, color: String(this.fillStyle) }); },
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['png'], { type: 'image/png' })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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

it.each<[ThemeId, string]>([['normal','#1b4d3e'],['cool','#4cc9f0'],['cute','#cf3f79'],['dopa','#82eaff'],['moe','#ad285f']])('uses the %s theme while keeping all six counts and hashtag unchanged', async (theme, accent) => {
  const snapshot = createRecordShareSnapshot({ '2020-01-01':{tested:100,confirmed:20}, '2026-10-05':{tested:5,confirmed:2} }, [], new Date(2026,9,5));
  await renderRecordShareImage(snapshot, theme);
  expect(printed.find(item => item.text === '麻雀学習帳')?.color).toBe(accent);
  expect(printed.find(item => item.text === '#麻雀学習帳')?.color).toBe(accent);
  expect(printed.filter(item => /^\d[\d,]*$/.test(item.text)).map(item => item.text)).toEqual(['5','2','0','105','22','0']);
  if (theme === 'normal') { expect(loaded).toEqual([]); expect(ctx.drawImage).not.toHaveBeenCalled(); }
  else {
    expect(loaded).toHaveLength(2);
    for (const url of loaded) { expect(new URL(url).origin).toBe(window.location.origin); expect(new URL(url).pathname).toContain(`/themes/${theme}/`); expect(new URL(url).search).toBe(''); }
    expect(ctx.drawImage).toHaveBeenCalledTimes(3);
  }
  const font = printed[0]!.font;
  expect(font).toContain(theme === 'cute' || theme === 'moe' ? 'Zen Maru Gothic' : 'IBM Plex Sans JP');
});

it('keeps the selected theme and its counts if packaged images fail', async () => {
  failArt = true;
  const snapshot = createRecordShareSnapshot(undefined, undefined, new Date(2026,9,5));
  const image = await renderRecordShareImage(snapshot, 'dopa');
  expect(image.blob.type).toBe('image/png'); expect(ctx.drawImage).not.toHaveBeenCalled();
  expect(printed[0]!.color).toBe('#82eaff'); expect(printed.filter(item=>item.text==='0')).toHaveLength(6);
});

it('uses a safe default for an unknown runtime theme and never builds arbitrary image URLs', async () => {
  const snapshot = createRecordShareSnapshot(undefined, undefined, new Date(2026,9,5));
  await renderRecordShareImage(snapshot, 'https://example.com/private' as ThemeId);
  expect(loaded).toEqual([]); expect(printed[0]!.color).toBe('#1b4d3e');
});
