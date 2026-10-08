// Synthetic images and injected recognition outputs test the checker, not OCR accuracy.
import { chromium, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5177';
const browser = await chromium.launch({ headless: true, executablePath: process.env.MAHJONG_CHROMIUM || undefined });
const cell = (label, sure = true, rotated = false) => ({ label, sure, rotated, feat: [], preview: '' });
const result = { game: 'jantama', hand: [cell('1m'), cell('0p'), cell('1m', false)], melds: [[cell('1z', true, true), cell('1z'), cell('1z')]], dora: [], roundWind: null, handNumber: null, honba: null, riichiSticks: null, seatWind: null, turn: null, players: 4, scores: { self: null, right: null, across: null, left: null }, estimated: [] };
const reports = [];
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', acceptDownloads: true });
    const requests = [];
    const pageErrors = [];
    const page = await context.newPage();
    page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await context.route('**/*', (r) => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await context.route('**/src/features/import/autoRead.ts*', (r) => r.fulfill({ contentType: 'application/javascript', body: `
      export const prepareModel = (_model, local) => { window.__receivedLocalBank = local; return {}; };
      export const autoRead = () => window.__testResult;
    ` }));
    let delayModel = 0;
    let failModel = false;
    await context.route('**/import-model.json*', async (r) => {
      if (delayModel) await new Promise(resolve => setTimeout(resolve, delayModel));
      await r.fulfill({ status: failModel ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ version: 4, games: { jantama: { tiles: {}, glyphs: {} }, tenhou: { tiles: {}, glyphs: {} } } }) }).catch(() => {});
    });
    await context.addInitScript((fixture) => {
      localStorage.setItem('mahjong-study:v1', '{"private":"keep"}');
      localStorage.setItem('mahjong-study:import:v2', '{"private":"learned tiles"}');
      sessionStorage.setItem('mahjong-study:import-draft', 'existing draft');
      window.__testResult = fixture; window.__storageCalls = [];
      for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function(...args) { window.__storageCalls.push([method, ...args]); return original.apply(this, args); };
      }
    }, result);
    await page.goto(`${origin}/ocr-check.html`);
    await expect(page.getByRole('heading', { name: '画像認識チェック', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '正解を確定して比較', exact: true })).toHaveCount(0);
    const data = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 360; c.getContext('2d').fillRect(0, 0, 640, 360); return c.toDataURL().split(',')[1]; });
    const image = { name: '=fixture.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
    const select = () => page.locator('input[type=file]').setInputFiles(image);
    await select();
    await expect(page.getByRole('heading', { name: '2. 現行OCRの結果', exact: true })).toBeVisible();
    await expect(page.getByText('正解未確定のため、まだ一致率を算出していません。', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__receivedLocalBank)).toEqual({});
    await page.getByLabel('元画像の拡大').fill('2');
    await page.getByLabel('正解の手牌', { exact: true }).fill('1m 1m 0p');
    await page.getByRole('button', { name: '副露を追加', exact: true }).click();
    await page.getByLabel('種別', { exact: true }).selectOption('pon');
    await page.getByLabel('牌（槓は4牌）', { exact: true }).fill('1z 1z 1z');
    await page.getByRole('button', { name: '正解を確定して比較', exact: true }).click();
    await expect(page.getByText('一致（1 / 1画像）', { exact: true })).toBeVisible();
    for (const kind of ['JSON', 'CSV']) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: `結果${kind}を保存`, exact: true }).click()]);
      const stream = await download.createReadStream(); const chunks = []; for await (const c of stream) chunks.push(c);
      const text = Buffer.concat(chunks).toString('utf8');
      expect(text).not.toContain('data:image'); expect(text).not.toContain('blob:');
      if (kind === 'JSON') { const parsed = JSON.parse(text); expect(parsed.metrics.exact).toBe(true); expect(parsed.model.localBank).toBe('empty'); expect(parsed.metricVersion).toBe('multiset-v1'); expect(parsed.codeRevision).toMatch(/^[0-9a-f]{40}$/); }
      else expect(text).toContain("'=fixture.png");
    }
    await page.getByLabel('正解の手牌', { exact: true }).fill('1m 1m 5p');
    await expect(page.getByText('正解未確定のため、まだ一致率を算出していません。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '正解を確定して比較', exact: true }).click();
    await expect(page.getByText('不一致（0 / 1画像）', { exact: true })).toBeVisible();
    await select();
    await expect(page.getByLabel('正解の手牌', { exact: true })).toHaveValue('');
    await expect(page.getByText('正解未確定のため、まだ一致率を算出していません。', { exact: true })).toBeVisible();
    // Cancel and rapid reselection: an older completion must not repopulate cleared truth/results.
    delayModel = 500;
    await select(); await page.getByRole('button', { name: '中断', exact: true }).click();
    await page.waitForTimeout(650);
    await expect(page.getByRole('heading', { name: '2. 現行OCRの結果', exact: true })).toHaveCount(0);
    await select(); await select();
    await expect(page.getByRole('heading', { name: '2. 現行OCRの結果', exact: true })).toBeVisible();
    delayModel = 0;
    await page.locator('input[type=file]').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a png') });
    await expect(page.getByRole('alert')).toContainText('画像を読み込めません');
    await expect(page.getByRole('heading', { name: '4. 差分と一致率', exact: true })).toHaveCount(0);
    await page.locator('input[type=file]').setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) });
    await expect(page.getByRole('alert')).toContainText('20 MiB');
    failModel = true; await select(); await expect(page.getByRole('alert')).toContainText('同梱モデル'); failModel = false;
    await page.evaluate(() => { window.__testResult = null; });
    await select(); await expect(page.getByRole('status')).toContainText('手牌を認識できませんでした');
    await page.getByLabel('正解の手牌', { exact: true }).fill('1m');
    await page.getByLabel('画像に副露がないことを確認しました', { exact: true }).check();
    await page.getByRole('button', { name: '正解を確定して比較', exact: true }).click();
    await expect(page.getByText('不一致（0 / 1画像）', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => window.__storageCalls)).toEqual([]);
    expect(await page.evaluate(() => localStorage['mahjong-study:v1'])).toBe('{"private":"keep"}');
    expect(await page.evaluate(() => localStorage['mahjong-study:import:v2'])).toBe('{"private":"learned tiles"}');
    expect(await page.evaluate(() => sessionStorage['mahjong-study:import-draft'])).toBe('existing draft');
    expect(requests.every((r) => r.method === 'GET' && r.body === null && new URL(r.url).origin === origin)).toBe(true);
    expect(requests.some((r) => r.url.includes('fixture.png'))).toBe(false);
    expect(pageErrors).toEqual([]);
    reports.push({ width, syntheticUiFlow: 'passed', localStorageUntouched: true, imageUploadRequests: 0 });
    await context.close();
  }
  console.log(JSON.stringify(reports, null, 2));
} finally { await browser.close(); }
