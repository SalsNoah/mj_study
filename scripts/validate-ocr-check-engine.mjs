// Synthetic fixtures exercise real browser decoding and the unchanged bundled OCR.
import { chromium, expect } from '@playwright/test';
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5177';
const browser = await chromium.launch({ executablePath: process.env.MAHJONG_CHROMIUM || undefined });
try {
  const page = await browser.newPage();
  await page.goto(`${origin}/ocr-check.html`);
  const report = await page.evaluate(async () => {
    const { decode, recognizeFile } = await import('/src/ocr-check/engine.ts');
    const make = async (w, h, type = 'image/png') => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const blob = await new Promise(resolve => c.toBlob(resolve, type));
      return new File([blob], 'synthetic.' + (type === 'image/jpeg' ? 'jpg' : 'png'), { type });
    };
    const read = async (file, signal = new AbortController().signal) => {
      const url = URL.createObjectURL(file);
      try { const d = await decode(file, url, signal); return [d.width, d.height, d.img.width, d.img.height]; }
      catch (e) { return e.name + ': ' + e.message; }
      finally { URL.revokeObjectURL(url); }
    };
    const jpeg = new Uint8Array(await (await make(20, 30, 'image/jpeg')).arrayBuffer());
    // EXIF orientation 6: rotate 90 degrees clockwise.
    const exif = new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
    const oriented = new File([jpeg.slice(0,2), exif, jpeg.slice(2)], 'orientation6.jpg', { type: 'image/jpeg' });
    const ctrl = new AbortController(); ctrl.abort();
    const checks = {
      exif6: await read(oriented), scaled: await read(await make(2200,1100)),
      excessivePixels: await read(await make(5000,5000)),
      empty: await read(new File([], 'empty.png', { type: 'image/png' })),
      unsupported: await read(new File(['x'], 'x.heic', { type: 'image/heic' })),
      aborted: await read(oriented, ctrl.signal),
    };
    const calls = []; const originals = {};
    for (const method of ['getItem','setItem','removeItem','clear']) {
      originals[method] = Storage.prototype[method];
      Storage.prototype[method] = function(...args) { calls.push(method); return originals[method].apply(this,args); };
    }
    const file = await make(640,360); const url = URL.createObjectURL(file);
    try {
      const result = await recognizeFile(file,url,new AbortController().signal);
      checks.realEngine = { status: result.raw === null ? 'notDetected' : 'recognized', localBank: result.model.localBank, hash: result.model.sha256, revision: result.codeRevision, storageCalls: calls };
    } finally { URL.revokeObjectURL(url); for (const method in originals) Storage.prototype[method] = originals[method]; }
    return checks;
  });
  expect(report.exif6).toEqual([30,20,30,20]); expect(report.scaled).toEqual([2200,1100,1920,960]);
  expect(report.excessivePixels).toContain('2400万'); expect(report.empty).toContain('空でない');
  expect(report.unsupported).toContain('HEIC'); expect(report.aborted).toContain('AbortError');
  expect(report.realEngine.status).toBe('notDetected'); expect(report.realEngine.localBank).toBe('empty');
  expect(report.realEngine.hash).toMatch(/^[0-9a-f]{64}$/); expect(report.realEngine.storageCalls).toEqual([]);
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
