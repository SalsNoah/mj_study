import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderHandPng } from './renderTiles';
import { tileImageUrl } from '@/components/tileImages';
import type { TileCode } from '@/domain/types';
import { createLegacySampleProblems } from '@/data/legacySamples';

const drawImage = vi.fn();

beforeEach(() => {
  drawImage.mockClear();
  vi.stubGlobal('Image', class {
    onload?: () => void;
    private url = '';
    get src() { return this.url; }
    set src(value: string) { this.url = value; queueMicrotask(() => this.onload?.()); }
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(), fillText: vi.fn(), drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AQID');
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const tiles: TileCode[] = ['9m', '1m', '2m', '3m', '5m', '0m', '2p', '3p', '4p', '4s', '5s', '6s', '7z', '7z'];

it.each([false, true])('draws all 14 tiles with the same spacing and baseline (legacy=%s)', async (legacy) => {
  const input = { concealed: legacy ? tiles.slice(0, 13) : [...tiles], drawn: legacy ? tiles[13]! : null, melds: [], doraIndicators: [] };
  const snapshot = structuredClone(input);
  const image = await renderHandPng(input);
  expect(drawImage).toHaveBeenCalledTimes(14);
  expect(drawImage.mock.calls.map(([img]) => (img as HTMLImageElement).src)).toEqual(tiles.map((code) => tileImageUrl(code, false)));
  expect(drawImage.mock.calls.map(([, x, y, w, h]) => [x, y, w, h])).toEqual(tiles.map((_, index) => [40 + 78 * index, 40, 72, 96]));
  expect(image.blob.type).toBe('image/png');
  expect(input).toEqual(snapshot);
});

it('draws a lone legacy tile at the normal start position', async () => {
  await renderHandPng({ concealed: [], drawn: '0s', melds: [], doraIndicators: [] });
  expect(drawImage).toHaveBeenCalledTimes(1);
  expect(drawImage.mock.calls[0]!.slice(1)).toEqual([40, 40, 72, 96]);
});

it('keeps question images, explanation images, and legacy images out of the hand PNG', async () => {
  const problem = createLegacySampleProblems().problems[0]!;
  problem.attachments = [
    { id: 'question', role: 'question', dataUrl: 'data:image/png;base64,AQ==', width: 1, height: 1 },
    { id: 'explanation', role: 'explanation', dataUrl: 'data:image/png;base64,Ag==', width: 1, height: 1 },
    { id: 'legacy', dataUrl: 'data:image/png;base64,Aw==', width: 1, height: 1 },
  ];
  await renderHandPng(problem);
  const drawnSources = drawImage.mock.calls.map(([image]) => (image as HTMLImageElement).src);
  for (const attachment of problem.attachments) expect(drawnSources).not.toContain(attachment.dataUrl);
  expect(drawnSources.length).toBeGreaterThan(0);
});

it('keeps melds and indicators separate while aligning the full hand below them', async () => {
  await renderHandPng({
    concealed: ['5m'], drawn: '0m', doraIndicators: ['1z'],
    melds: [{ id: 'pon', type: 'pon', tiles: ['5p', '0p', '5p'], from: 'opposite', calledIndex: 1, addedIndex: null }],
  });
  expect(drawImage).toHaveBeenCalledTimes(6);
  expect(drawImage.mock.calls.slice(-2).map(([, x, y, w, h]) => [x, y, w, h])).toEqual([[40, 292, 72, 96], [118, 292, 72, 96]]);
  expect((drawImage.mock.calls[2]![0] as HTMLImageElement).src).toBe(tileImageUrl('0p', true));
});
