import { afterEach, expect, it, vi } from 'vitest';
import { compressImageFile } from './renderTiles';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['image/png', 'image/jpeg', 'image/webp'])('continues compressing %s attachments after hand PNG export is removed', async (type) => {
  const bitmap = { width: 2560, height: 1440 };
  const readImage = vi.fn().mockResolvedValue(bitmap);
  vi.stubGlobal('createImageBitmap', readImage);
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  const output = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AQID');
  const file = new File(['image'], 'attachment', { type });
  expect(await compressImageFile(file)).toEqual({ ok: true, dataUrl: 'data:image/jpeg;base64,AQID', width: 1280, height: 720 });
  expect(readImage).toHaveBeenCalledWith(file);
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1280, 720);
  expect(output).toHaveBeenCalledWith('image/jpeg', 0.82);
});
