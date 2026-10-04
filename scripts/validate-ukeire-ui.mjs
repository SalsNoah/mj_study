// Local-only browser test: existing Chromium, fresh ephemeral profile, synthetic tiles.
// No access to the user's browser/profile, external sites, or OS/network settings.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const evidence = new URL('../evidence/ukeire/', import.meta.url).pathname;
await mkdir(evidence, { recursive: true });
const executablePath = process.env.MAHJONG_CHROMIUM_EXECUTABLE;
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176';
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ viewport: { width: 320, height: 720 }, serviceWorkers: 'block' });
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin === origin || url.protocol === 'data:') await route.continue();
  else await route.abort();
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
async function selectRemaining(label) {
  const suit = label.endsWith('萬') ? '萬子' : label.endsWith('筒') ? '筒子' : label.endsWith('索') ? '索子' : '字牌';
  await page.locator('.remaining-suits button').filter({ hasText: suit }).click();
  await page.locator('.remaining-tile').filter({ has: page.getByRole('img', { name: label, exact: true }) }).click();
}
async function fillRemaining(label, value) {
  await selectRemaining(label);
  await page.getByRole('textbox', { name: `${label}の残枚数`, exact: true }).fill(value);
}
async function capture(name, selector = '.ukeire-panel') {
  await page.locator(selector).scrollIntoViewIfNeeded();
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
  await page.goto(origin);
  await expect(page.locator('.ukeire-panel')).toContainText('13〜14枚で表示');
  const inputNames = ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','赤五索','五索','中'];
  for (const name of inputNames) await page.locator('.tile-palette').getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.ukeire-panel')).toContainText('1シャンテン');
  await capture('editor-13-320');
  await page.locator('.tile-palette').getByRole('button', { name: '中', exact: true }).click();
  await expect(page.locator('.ukeire-list > li')).toHaveCount(13);
  const editorRows = await page.locator('.ukeire-list').textContent();
  await capture('editor-discard-320');
  await page.getByRole('button', { name: '戻す', exact: true }).click();
  await expect(page.locator('.ukeire-list')).toHaveCount(0);
  await page.locator('.tile-palette').getByRole('button', { name: '中', exact: true }).click();
  const toolbar = page.locator('.tile-actions');
  await expect(toolbar.getByRole('button', { name: '残枚数', exact: true })).toBeEnabled();
  expect(await toolbar.locator('button').allTextContents()).toEqual(['理牌', '戻す', '全消去', '残枚数']);
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const rects = await toolbar.locator('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON()));
    expect(rects[3].y).toBe(rects[2].y);
    expect(rects[3].x).toBeGreaterThanOrEqual(rects[2].right);
    expect(rects.every(rect => rect.height >= 44 && rect.left >= 0 && rect.right <= width)).toBe(true);
    await capture(`editor-toolbar-${width}`, '.tile-actions');
  }
  await page.setViewportSize({ width: 320, height: 720 });
  await toolbar.getByRole('button', { name: '残枚数', exact: true }).click();
  await expect(page.locator('.remaining-tile')).toHaveCount(9);
  await expect(page.locator('.remaining-panel input')).toHaveCount(1);
  await fillRemaining('三索', '0');
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await capture(`remaining-compact-${width}`, '.remaining-panel');
    await page.locator('.remaining-panel').screenshot({ path: `${evidence}remaining-panel-${width}.png` });
    const geometry = await page.locator('.remaining-panel').evaluate(panel => ({
      width: panel.getBoundingClientRect().width,
      height: panel.getBoundingClientRect().height,
      overflow: panel.scrollWidth > panel.clientWidth + 1,
      targets: [...panel.querySelectorAll('button,input')].map(el => {
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    }));
    expect(geometry.height).toBeLessThan(380);
    expect(geometry.overflow).toBe(false);
    expect(geometry.targets.every(rect => rect.width >= 44 && rect.height >= 44)).toBe(true);
    results.push({ name: `remaining-geometry-${width}`, geometry });
  }
  for (let i = 0; i < 3; i++) {
    await toolbar.getByRole('button', { name: '残枚数', exact: true }).click();
    await expect(page.locator('.remaining-panel')).not.toBeVisible();
    await toolbar.getByRole('button', { name: '残枚数', exact: true }).press('Enter');
    await expect(page.getByRole('textbox', { name: '三索の残枚数', exact: true })).toHaveValue('0');
  }
  await page.getByRole('button', { name: 'すべて自動に戻す', exact: true }).click();
  await expect(page.locator('.ukeire-list')).toHaveText(editorRows);
  await toolbar.getByRole('button', { name: '残枚数', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page).toHaveURL(/#\/problems\//);
  await expect(page.locator('.ukeire-list')).toHaveText(editorRows);
  await capture('detail-320');
  const saved = await page.evaluate(() => localStorage.getItem('mahjong-study:v1'));
  await page.getByRole('button', { name: '残枚数', exact: true }).click();
  await selectRemaining('三索');
  await expect(page.getByRole('textbox', { name: '三索の残枚数', exact: true })).toHaveValue('3');
  await fillRemaining('三索', '0');
  await fillRemaining('六索', '1');
  await expect(page.locator('.ukeire-row').filter({ has: page.getByLabel('赤五索を切る', { exact: true }) })).toContainText('1種・1枚');
  await expect(page.locator('.remaining-tile.is-manual')).toHaveCount(2);
  await page.getByRole('textbox', { name: '六索の残枚数', exact: true }).fill('5');
  await expect(page.locator('.remaining-error')).toContainText('集計は1枚');
  await page.getByRole('button', { name: '六索の残枚数を1枚減らす', exact: true }).click();
  await expect(page.locator('.remaining-error')).toHaveCount(0);
  await expect(page.locator('.ukeire-row').filter({ has: page.getByLabel('赤五索を切る', { exact: true }) })).toContainText('0種・0枚');
  await capture('manual-remaining-320');
  expect(await page.evaluate(() => localStorage.getItem('mahjong-study:v1'))).toBe(saved);
  await page.locator('.ukeire-panel summary').click();
  await expect(page.locator('.ukeire-list')).not.toBeVisible();
  await page.locator('.ukeire-panel summary').press('Enter');
  await expect(page.locator('.ukeire-list')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('mahjong-study:v1'))).toBe(saved);
  await page.reload();
  await expect(page.locator('.ukeire-list')).toHaveText(editorRows);
  await expect(page.locator('.remaining-status').filter({ hasText: '手動' })).toHaveCount(0);
  await page.getByRole('button', { name: '共有URLを生成', exact: true }).click();
  const shareUrl = await page.locator('.share-box textarea').inputValue();
  expect(shareUrl).toContain('#share=v1.');
  expect(await page.evaluate(() => localStorage.getItem('mahjong-study:v1'))).toBe(saved);
  await page.getByRole('button', { name: '確認した', exact: true }).click();
  await page.getByRole('button', { name: '取り消す', exact: true }).click();
  await page.getByRole('link', { name: 'テスト', exact: true }).click();
  await page.getByRole('button', { name: '1 問でテスト開始', exact: true }).click();
  await expect(page.locator('.ukeire-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '残枚数', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '解説を見る', exact: true }).click();
  await expect(page.locator('.ukeire-list')).toHaveText(editorRows);
  await expect(page.getByRole('button', { name: '残枚数', exact: true })).toBeEnabled();
  await expect(page.locator('.ukeire-panel')).not.toContainText('テンパイ（0）');
  await expect(page.locator('.ukeire-panel .hint')).toHaveCount(0);
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
