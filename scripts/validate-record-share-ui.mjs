// Isolated synthetic profiles. Native share is a test double; no X post or login.
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const out = new URL('../evidence/record-share-ui/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176';
const browser = await chromium.launch({ headless: true });
const results = [], errors = [], network = [];
const empty = { schemaVersion: 1, revision: 0, problems: [], tags: [], study: [], attempts: [], settings: { autoSort: true }, daily: {}, materials: [], materialStudyEvents: [] };
const history = structuredClone(empty);
history.daily = { '2000-01-01': { tested: 100, confirmed: 20 }, '2026-10-04': { tested: 8, confirmed: 3 }, '2026-10-05': { tested: 5, confirmed: 2 } };
history.materials = [{ id: 'synthetic', title: 'PRIVATE TITLE MUST NOT BE SHARED', url: 'https://example.com/private', comment: 'PRIVATE COMMENT MUST NOT BE SHARED', createdAt: '2020-01-01T03:00:00Z', updatedAt: '2020-01-01T03:00:00Z' }];
history.materialStudyEvents = [{ id: 'older', at: '2020-01-01T03:00:00Z' }, { id: 'today', at: '2026-10-05T03:00:00Z' }].map(event => ({ ...event, materialId: 'synthetic', title: 'PRIVATE TITLE MUST NOT BE SHARED', url: 'https://example.com/private', comment: 'PRIVATE COMMENT MUST NOT BE SHARED' }));
const expected = '2026-10-05の学習記録\n今日：テスト5回・確認2回・教材1回\n累計：テスト113回・確認25回・教材2回\n#麻雀学習帳';
async function open(theme, data = history, mode = 'unsupported') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, timezoneId: 'Asia/Tokyo', serviceWorkers: 'block', acceptDownloads: true });
  await context.addInitScript(({ theme, data, mode }) => {
    localStorage.setItem('mahjong-study:v1', JSON.stringify(data));
    localStorage.setItem('mahjong-study:theme', theme);
    window.__recordShareCalls = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: mode === 'unsupported' ? undefined : payload => !!payload.files?.length });
    Object.defineProperty(navigator, 'share', { configurable: true, value: mode === 'unsupported' ? undefined : payload => {
      window.__recordShareCalls.push({ text: payload.text, fileCount: payload.files.length, type: payload.files[0].type, size: payload.files[0].size, name: payload.files[0].name });
      return mode === 'cancel' ? Promise.reject(new DOMException('cancelled', 'AbortError')) : mode === 'error' ? Promise.reject(new DOMException('blocked', 'NotAllowedError')) : Promise.resolve();
    } });
  }, { theme, data, mode });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    network.push({ url: url.href, action: url.origin === 'https://twitter.com' && url.pathname === '/intent/tweet' ? 'intercepted-composer-test' : 'blocked' });
    if (url.origin === 'https://twitter.com' && url.pathname === '/intent/tweet') return route.fulfill({ status: 200, contentType: 'text/plain', body: 'Synthetic composer destination. No X request was made.' });
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-10-05T03:00:00Z'));
  await page.goto(`${origin}/#/records`);
  await expect(page.getByRole('heading', { name: '記録帳', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  return { page, context };
}
async function preview(page) {
  await page.getByRole('button', { name: 'Xに記録を投稿', exact: true }).click();
  await expect(page.locator('.record-share-preview')).toBeVisible();
  await expect(page.locator('.record-share-preview')).toHaveJSProperty('naturalWidth', 1080);
  await expect(page.locator('.record-share-preview')).toHaveJSProperty('naturalHeight', 1080);
}
async function capture(page, name, bottom = false) {
  if (bottom) await page.locator('.record-share-fallback').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}${name}.png`, animations: 'disabled' });
  const dimensions = await page.evaluate(() => {
    const dialog = document.querySelector('.record-share-dialog');
    const controls = [...dialog.querySelectorAll('button, a')].map(el => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { text: el.textContent, width: r.width, height: r.height, x: r.x, right: r.right, top: r.top, bottom: r.bottom, hit: !!hit && el.contains(hit) };
    });
    return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, dialogWidth: dialog.clientWidth, dialogContent: dialog.scrollWidth, controls };
  });
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.dialogContent).toBeLessThanOrEqual(dimensions.dialogWidth);
  for (const control of dimensions.controls) {
    expect(control.width).toBeGreaterThanOrEqual(44); expect(control.height).toBeGreaterThanOrEqual(44);
    expect(control.x).toBeGreaterThanOrEqual(0); expect(control.right).toBeLessThanOrEqual(dimensions.width);
    if (bottom && control.text.startsWith('2.')) expect(control.hit).toBe(true);
  }
  results.push({ name, ...dimensions });
}
try {
  for (const theme of ['normal', 'cool', 'cute', 'dopa']) {
    const { page, context } = await open(theme);
    const saved = await page.evaluate(() => localStorage.getItem('mahjong-study:v1'));
    await preview(page);
    await expect(page.getByLabel('投稿文', { exact: true })).toHaveValue(expected);
    await expect(page.getByRole('button', { name: '画像と文面を共有', exact: true })).toHaveCount(0);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 740 });
      await page.locator('.record-share-dialog').evaluate(el => el.scrollTop = 0);
      await capture(page, `${theme}-preview-${width}`);
      await capture(page, `${theme}-actions-${width}`, true);
    }
    await page.setViewportSize({ width: 320, height: 740 });
    await page.evaluate(() => document.documentElement.style.fontSize = '150%');
    await page.locator('.record-share-dialog').evaluate(el => el.scrollTop = 0);
    await capture(page, `${theme}-preview-320-text150`);
    await capture(page, `${theme}-actions-320-text150`, true);
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    if (theme === 'normal') {
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('link', { name: '1. 画像を保存', exact: true }).click();
      const download = await downloadPromise;
      await download.saveAs(`${out}record-image.png`);
      const bytes = await readFile(`${out}record-image.png`);
      expect([...bytes.subarray(0, 8)]).toEqual([137,80,78,71,13,10,26,10]);
      expect(bytes.readUInt32BE(16)).toBe(1080); expect(bytes.readUInt32BE(20)).toBe(1080);
      expect(download.suggestedFilename()).toBe('mahjong-study-records-2026-10-05.png');
      const popupPromise = page.waitForEvent('popup');
      await page.getByRole('link', { name: '2. Xの投稿画面を開く', exact: true }).click();
      const popup = await popupPromise; await popup.waitForLoadState();
      expect(new URL(popup.url()).searchParams.get('text')).toBe(expected);
      expect(await popup.evaluate(() => window.opener === null)).toBe(true);
      await popup.close();
      results.push({ name: 'real-png-download-and-intercepted-x-composer', bytes: bytes.length, status: 'pass' });
    }
    await page.getByRole('button', { name: '閉じる', exact: true }).focus();
    await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('link', { name: '2. Xの投稿画面を開く', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: '閉じる', exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Xに記録を投稿', exact: true })).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('mahjong-study:v1'))).toBe(saved);
    await context.close();
  }
  for (const mode of ['native', 'cancel', 'error']) {
    const { page, context } = await open('normal', history, mode);
    await preview(page); await page.getByRole('button', { name: '画像と文面を共有', exact: true }).click();
    const calls = await page.evaluate(() => window.__recordShareCalls);
    expect(calls).toHaveLength(1); expect(calls[0].text).toBe(expected); expect(calls[0].fileCount).toBe(1); expect(calls[0].type).toBe('image/png'); expect(calls[0].size).toBeGreaterThan(1000);
    expect(context.pages()).toHaveLength(1);
    await capture(page, `share-${mode}`, true);
    results.push({ name: `native-api-test-double-${mode}`, ...calls[0], status: 'pass', limitation: 'Does not certify an OS share sheet or X receiving both image and text.' });
    await context.close();
  }
  for (const kind of ['empty', 'large']) {
    const data = structuredClone(empty);
    if (kind === 'large') data.daily = { '2026-10-05': { tested: 999999999, confirmed: 1000000000 } };
    const { page, context } = await open('normal', data);
    await preview(page); await capture(page, `share-${kind}-390`);
    const downloadPromise = page.waitForEvent('download'); await page.getByRole('link', { name: '1. 画像を保存', exact: true }).click();
    await (await downloadPromise).saveAs(`${out}record-image-${kind}.png`);
    await context.close();
  }
  expect(network.filter(item => item.action === 'blocked')).toEqual([]);
  expect(errors).toEqual([]);
} catch (error) { errors.push(error.stack ?? String(error)); throw error; }
finally { await writeFile(`${out}results.json`, JSON.stringify({ results, errors, network }, null, 2)); await browser.close(); }
