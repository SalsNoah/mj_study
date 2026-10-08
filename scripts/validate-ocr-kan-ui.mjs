// Artificial OCR results in an isolated browser. This does not measure image recognition.
import { chromium, expect } from '@playwright/test';
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5177';
const browser = await chromium.launch({ headless: true, executablePath: process.env.MAHJONG_CHROMIUM || undefined });
const cell = (label, rotated = false) => ({ label, rotated, sure: true, feat: [], preview: '' });
const result = (meld) => ({ game: 'jantama', hand: [cell('9s')], melds: [meld], dora: [], roundWind: null, handNumber: null, honba: null, riichiSticks: null, seatWind: null, turn: null, players: 4, scores: { self: null, right: null, across: null, left: null }, estimated: [] });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.route('**/src/features/import/autoRead.ts*', (route) => route.fulfill({ contentType: 'application/javascript', body: `
      export const GAME_NAMES = {jantama:'雀魂'};
      export const loadLocalBanks = () => ({});
      export const loadModel = async () => ({});
      export const prepareModel = () => ({jantama:{tiles:[]}});
      export const autoRead = () => window.__ocrKanFixture;
      export const rememberTile = () => {};
      export const rematchCell = c => c;
    ` }));
    await context.addInitScript(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'mahjong-study:import-draft') window.__lastOcrDraft = JSON.parse(value);
        return set.call(this, key, value);
      };
    });
    const page = await context.newPage();
    await page.goto(origin);
    await page.evaluate(async (fixture) => {
      window.__ocrKanFixture = fixture;
      const { setPendingShot } = await import('/src/features/import/draft.ts');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      setPendingShot(await new Promise(resolve => canvas.toBlob(resolve)));
      location.hash = '/import';
    }, result([cell('1z', true), cell('1z'), cell('1z'), cell('1z')]));
    const create = page.getByRole('button', { name: 'この内容で作成', exact: true });
    await expect(create).toBeVisible();
    await create.click();
    expect(await page.evaluate(() => window.__lastOcrDraft)).toBeUndefined();
    const confirm = page.getByRole('button', { name: '重なりなし・横向き1枚の大明槓と確認', exact: true });
    await expect(confirm).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await confirm.click();
    await expect(confirm).toHaveCount(0);
    await create.click();
    await expect(page.getByRole('heading', { name: '問題を作成', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__lastOcrDraft.melds[0])).toMatchObject({ type: 'openKan', from: 'left', tiles: ['1z', '1z', '1z', '1z'] });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    console.log(JSON.stringify({ width, ambiguousDraftBlocked: true, explicitKanConfirmed: true, draftTransferred: true }));
    await context.close();
  }
} finally { await browser.close(); }
