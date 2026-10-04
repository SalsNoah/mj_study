// Local-only browser test: existing Chromium, fresh ephemeral profile, synthetic tiles.
// No access to the user's browser/profile, external sites, or OS/network settings.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const evidence = new URL('../evidence/ukeire/', import.meta.url).pathname;
await mkdir(evidence, { recursive: true });
const executablePath = process.env.MAHJONG_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ viewport: { width: 320, height: 720 }, serviceWorkers: 'block' });
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin === 'http://127.0.0.1:5176' || url.protocol === 'data:') await route.continue();
  else await route.abort();
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
async function capture(name) {
  await page.locator('.ukeire-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidence}${name}.png`, fullPage: false });
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth, document: document.documentElement.scrollWidth,
    panel: document.querySelector('.ukeire-panel').getBoundingClientRect().toJSON(),
    overflow: [...document.querySelectorAll('.ukeire-row,.ukeire-tiles,.ukeire-panel')].filter(el => el.scrollWidth > el.clientWidth + 1).length,
  }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.overflow).toBe(0);
  results.push({ name, geometry });
}
try {
  await page.goto('http://127.0.0.1:5176/');
  await expect(page.locator('.ukeire-panel')).toContainText('現在0枚相当');
  const inputNames = ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','赤五索','五索','中'];
  for (const name of inputNames) await page.locator('.tile-palette').getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.ukeire-panel')).toContainText('13枚相当の現在');
  await capture('editor-13-320');
  await page.locator('.tile-palette').getByRole('button', { name: '中', exact: true }).click();
  await expect(page.locator('.ukeire-list > li')).toHaveCount(13);
  const editorRows = await page.locator('.ukeire-list').textContent();
  await capture('editor-discard-320');
  await page.getByRole('button', { name: '戻す', exact: true }).click();
  await expect(page.locator('.ukeire-list')).toHaveCount(0);
  await page.locator('.tile-palette').getByRole('button', { name: '中', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page).toHaveURL(/#\/problems\//);
  await expect(page.locator('.ukeire-list')).toHaveText(editorRows);
  await capture('detail-320');
  const saved = await page.evaluate(() => localStorage.getItem('mahjong-study:v1'));
  await page.locator('.remaining-panel summary').click();
  await expect(page.getByRole('textbox', { name: '三索の残枚数', exact: true })).toHaveValue('3');
  await page.getByRole('textbox', { name: '三索の残枚数', exact: true }).fill('0');
  await page.getByRole('textbox', { name: '六索の残枚数', exact: true }).fill('1');
  await expect(page.locator('.ukeire-row').filter({ hasText: '赤五索を切る' })).toContainText('1種・1枚');
  await expect(page.locator('.ukeire-adjust-status')).toContainText('2種を手動設定中');
  await page.getByRole('textbox', { name: '六索の残枚数', exact: true }).fill('5');
  await expect(page.locator('.remaining-error')).toContainText('集計は1枚');
  await page.getByRole('button', { name: '六索の残枚数を1枚減らす', exact: true }).click();
  await expect(page.locator('.remaining-error')).toHaveCount(0);
  await expect(page.locator('.ukeire-row').filter({ hasText: '赤五索を切る' })).toContainText('0種・0枚');
  await capture('manual-remaining-320');
  expect(await page.evaluate(() => localStorage.getItem('mahjong-study:v1'))).toBe(saved);
  await page.locator('.ukeire-panel summary').click();
  await expect(page.locator('.ukeire-list')).not.toBeVisible();
  await page.locator('.ukeire-panel summary').press('Enter');
  await expect(page.locator('.ukeire-list')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('mahjong-study:v1'))).toBe(saved);
  await page.reload();
  await expect(page.locator('.ukeire-list')).toHaveText(editorRows);
  await expect(page.locator('.ukeire-adjust-status')).toContainText('すべて自動');
  await page.getByRole('button', { name: '共有URLを生成', exact: true }).click();
  const shareUrl = await page.locator('.share-box textarea').inputValue();
  expect(shareUrl).toContain('#share=v1.');
  expect(await page.evaluate(() => localStorage.getItem('mahjong-study:v1'))).toBe(saved);
  await page.getByRole('button', { name: '確認した', exact: true }).click();
  await page.getByRole('button', { name: '取り消す', exact: true }).click();
  await page.getByRole('link', { name: 'テスト', exact: true }).click();
  await page.getByRole('button', { name: '1 問でテスト開始', exact: true }).click();
  await expect(page.locator('.ukeire-panel')).toHaveCount(0);
  await page.getByRole('button', { name: '解説を見る', exact: true }).click();
  await expect(page.locator('.ukeire-list')).toHaveText(editorRows);
  await capture('test-answered-320');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mahjong-study:v1')));
  expect(after.attempts).toHaveLength(1);
  expect(after.study[0].confirmationCount).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('test-answered-390');
  await page.evaluate(() => document.documentElement.style.fontSize = '150%');
  await page.setViewportSize({ width: 320, height: 720 });
  await capture('test-answered-320-text150');
  expect(errors).toEqual([]);
  await writeFile(`${evidence}ui-results.json`, JSON.stringify({ status: 'pass', results, errors }, null, 2));
  console.log(JSON.stringify({ status: 'pass', captures: results.length, errors }));
} finally {
  await browser.close();
}
