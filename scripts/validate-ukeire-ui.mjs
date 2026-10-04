// Read-only browser QA against this checkout, using a fresh profile and synthetic data.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const evidence = new URL('../evidence/ukeire/', import.meta.url).pathname;
await mkdir(evidence, { recursive: true });
const executablePath = process.env.MAHJONG_CHROMIUM_EXECUTABLE;
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176';
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin === origin || url.protocol === 'data:') await route.continue();
  else await route.abort();
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const widths = [320, 375, 390];
const suitOf = label => label.endsWith('萬') ? '萬子' : label.endsWith('筒') ? '筒子' : label.endsWith('索') ? '索子' : '字牌';
async function pick(label) {
  await page.locator('.tile-palette').getByRole('button', { name: label, exact: true }).click();
}
async function selectRemaining(label) {
  await page.locator('.remaining-suits button').filter({ hasText: suitOf(label) }).click();
  await page.locator('.remaining-tile').filter({ has: page.getByRole('img', { name: label, exact: true }) }).click();
}
async function fillRemaining(label, value) {
  await selectRemaining(label);
  await page.getByRole('textbox', { name: `${label}の残枚数`, exact: true }).fill(value);
}
async function tab(id, name) { await page.locator(`#${id}-tab-${name}`).click(); }
async function capture(name, selector) {
  if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${evidence}${name}.png`, fullPage: false, animations: 'disabled' });
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth, document: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('.remaining-panel,.view-tabs,.tile-palette__row,.ukeire-row,.ukeire-tiles')]
      .filter(el => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth + 1)
      .map(el => el.className),
  }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.overflow).toEqual([]);
  const cta = await page.evaluate(() => {
    const button = [...document.querySelectorAll('.sticky-actions .btn-save')].find(el => el.getBoundingClientRect().width > 0);
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { top: rect.top, bottom: rect.bottom, navTop: nav.top, hit: !!hit && button.contains(hit) };
  });
  if (cta) { expect(cta.top).toBeGreaterThanOrEqual(0); expect(cta.bottom).toBeLessThanOrEqual(cta.navTop); expect(cta.hit).toBe(true); }
  results.push({ name, geometry, ...(cta ? { cta } : {}) });
}
async function allSizes(name, selector) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await capture(`${name}-${width}`, selector);
  }
}
async function targets(selector) {
  const rects = await page.locator(selector).evaluateAll(elements => elements.filter(el => el.getBoundingClientRect().width > 0).map(el => {
    const rect = el.getBoundingClientRect(); return { width: rect.width, height: rect.height };
  }));
  expect(rects.length).toBeGreaterThan(0);
  expect(rects.every(rect => rect.width >= 44 && rect.height >= 44)).toBe(true);
}
try {
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: '問題を作成' })).toBeVisible();
  await expect(page.locator('.context-panel')).toBeVisible();
  await expect(page.locator('#editor-view-tab-context')).toHaveCount(0);
  await expect(page.locator('.tile-palette__suits')).toHaveCount(0);
  await expect(page.locator('.tile-palette button:visible')).toHaveCount(37);
  const order = await page.evaluate(() => ({
    contextBottom: document.querySelector('.context-panel').getBoundingClientRect().bottom,
    handTop: document.querySelector('.hand-stage').getBoundingClientRect().top,
    inputTargets: [...document.querySelectorAll('.target-tabs button')].map(el => el.textContent.trim()),
  }));
  expect(order.contextBottom).toBeLessThanOrEqual(order.handTop);
  expect(order.inputTargets).toEqual(['手牌','ドラ表示牌','明順子','明刻子','明槓子','暗槓子','加槓子']);
  results.push({ name: 'continuous-editor-flow', order, mixedInputClicks: 14, suitSwitchClicks: 0 });
  await allSizes('editor-empty');
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await targets('.tile-actions button,.editor-save');
  }
  for (const name of ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','赤五索','五索','中','中']) await pick(name);
  await expect(page.locator('.ukeire-list > li')).toHaveCount(13);
  await expect(page.locator('.ukeire-list > li:not([hidden])')).toHaveCount(3);
  const editorRows = await page.locator('.ukeire-list').textContent();
  const toolbar = page.locator('.tile-actions');
  expect(await toolbar.locator('button').allTextContents()).toEqual(['理牌', '戻す', '全消去', '残枚数']);
  await allSizes('editor-hand');
  await toolbar.getByRole('button', { name: '残枚数', exact: true }).click();
  await fillRemaining('三索', '0');
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await capture(`remaining-compact-${width}`, '.remaining-panel');
    await page.locator('.remaining-panel').screenshot({ path: `${evidence}remaining-panel-${width}.png`, animations: 'disabled' });
    const geometry = await page.locator('.remaining-panel').evaluate(panel => ({ width: panel.clientWidth, height: panel.getBoundingClientRect().height }));
    expect(geometry.height).toBeLessThan(380);
    await targets('.remaining-panel button,.remaining-panel input');
    results.push({ name: `remaining-geometry-${width}`, geometry });
  }
  await page.locator('.editor-notes > summary').click();
  await page.getByLabel('タイトル（任意）').fill('スマホ検証用の問題');
  await page.getByLabel('解説', { exact: true }).fill('検証用の短い解説です。');
  await allSizes('editor-notes', '.editor-notes');
  await page.locator('.editor-notes > summary').click();
  await page.getByLabel('本場', { exact: true }).fill('2');
  await allSizes('editor-context');
  await expect(page.getByRole('textbox', { name: '三索の残枚数', exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: 'すべて自動に戻す', exact: true }).click();
  await toolbar.getByRole('button', { name: '残枚数', exact: true }).click();
  await page.locator('.ukeire-panel summary').click();
  await expect(page.locator('.ukeire-list')).toBeVisible();
  await page.locator('.ukeire-expand').click();
  await expect(page.locator('.ukeire-list > li:visible')).toHaveCount(13);
  await toolbar.getByRole('button', { name: '戻す', exact: true }).click();
  await pick('中');
  await expect(page.locator('.ukeire-list > li:visible')).toHaveCount(3);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'スマホ検証用の問題' })).toBeVisible();
  await expect(page.locator('#detail-view-panel-notes')).toBeVisible();
  await allSizes('detail-notes');
  const saved = await page.evaluate(() => localStorage.getItem('mahjong-study:v1'));
  await tab('detail-view', 'ukeire');
  await expect(page.locator('.ukeire-list')).toHaveText(editorRows);
  await expect(page.locator('.ukeire-list > li:visible')).toHaveCount(3);
  await allSizes('detail-ukeire-top3', '.ukeire-panel');
  await page.getByRole('button', { name: '残枚数', exact: true }).click();
  await page.locator('.ukeire-expand').click();
  await expect(page.locator('.ukeire-list > li:not([hidden])')).toHaveCount(13);
  await capture('detail-ukeire-expanded-390', '.ukeire-list');
  await fillRemaining('三索', '0'); await fillRemaining('六索', '1');
  await expect(page.locator('.ukeire-row').filter({ has: page.getByLabel('赤五索を切る', { exact: true }) })).toContainText('1種・1枚');
  await page.getByRole('textbox', { name: '六索の残枚数', exact: true }).fill('5');
  await expect(page.locator('.remaining-error')).toContainText('集計は1枚');
  await page.getByRole('button', { name: '六索の残枚数を1枚減らす', exact: true }).click();
  await expect(page.locator('.remaining-error')).toHaveCount(0);
  await tab('detail-view', 'notes'); await tab('detail-view', 'ukeire');
  await expect(page.getByRole('textbox', { name: '六索の残枚数', exact: true })).toHaveValue('0');
  expect(await page.evaluate(() => localStorage.getItem('mahjong-study:v1'))).toBe(saved);
  await allSizes('detail-ukeire', '.remaining-panel');
  await page.locator('.detail-tools > summary').click();
  await page.getByRole('button', { name: '共有URLを生成', exact: true }).click();
  expect(await page.locator('.share-box textarea').inputValue()).toContain('#share=v1.');
  expect(await page.evaluate(() => localStorage.getItem('mahjong-study:v1'))).toBe(saved);
  await page.getByRole('button', { name: '確認した', exact: true }).click();
  await page.getByRole('button', { name: '取り消す', exact: true }).click();
  await page.getByRole('link', { name: 'テスト', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'テスト', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await allSizes('test-setup');
  await page.getByRole('button', { name: '1 問でテスト開始', exact: true }).click();
  await expect(page.locator('.ukeire-panel')).toHaveCount(0);
  await expect(page.locator('#answer-view-tab-notes')).toHaveCount(0);
  await allSizes('test-question');
  await page.getByRole('button', { name: '解説を見る', exact: true }).click();
  await expect(page.locator('#answer-view-panel-notes')).toBeVisible();
  await allSizes('test-answered');
  await tab('answer-view', 'ukeire');
  await expect(page.locator('.ukeire-list')).toHaveText(editorRows);
  await page.locator('.ukeire-expand').click();
  await capture('test-ukeire-expanded-390', '.ukeire-panel');
  await page.getByRole('button', { name: '残枚数', exact: true }).click();
  await fillRemaining('三索', '0');
  await tab('answer-view', 'notes'); await tab('answer-view', 'ukeire');
  await expect(page.getByRole('textbox', { name: '三索の残枚数', exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: '理解できた', exact: true }).click();
  await page.getByRole('button', { name: '結果を見る', exact: true }).click();
  await expect(page.locator('.ukeire-panel')).toHaveCount(0);
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('mahjong-study:v1')));
  expect(data.attempts).toHaveLength(1); expect(data.study[0].confirmationCount).toBe(0);
  await page.getByRole('link', { name: '学習帳', exact: true }).click();
  await expect(page.getByRole('heading', { name: '学習帳', exact: true })).toBeVisible();
  await allSizes('library');
  await page.getByRole('link', { name: '記録帳', exact: true }).click();
  await allSizes('records');
  await page.getByRole('link', { name: '設定', exact: true }).click();
  await allSizes('settings');
  await page.getByRole('tab', { name: 'データ管理', exact: true }).click();
  await allSizes('settings-data');
  await page.getByRole('link', { name: '作成', exact: true }).click();
  await page.evaluate(() => document.documentElement.style.fontSize = '150%');
  await page.setViewportSize({ width: 320, height: 720 });
  await capture('editor-320-text150');
  await targets('.tile-actions button,.editor-save');
  await page.locator('.editor-notes > summary').click(); await capture('notes-320-text150', '.editor-notes');
  await page.locator('.editor-notes > summary').click();
  for (const name of ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','五索','中','中']) await pick(name);
  await page.getByRole('button', { name: '残枚数', exact: true }).click();
  await capture('remaining-320-text150', '.remaining-panel');
  await targets('.remaining-panel button,.remaining-panel input');
  await page.getByRole('textbox', { name: '一萬の残枚数', exact: true }).focus();
  await page.setViewportSize({ width: 320, height: 480 });
  await page.getByRole('textbox', { name: '一萬の残枚数', exact: true }).scrollIntoViewIfNeeded();
  await capture('remaining-320-shortviewport', '.remaining-control');
  expect(errors).toEqual([]);
  await writeFile(`${evidence}ui-results.json`, JSON.stringify({ status: 'pass', results, errors }, null, 2));
  console.log(JSON.stringify({ status: 'pass', captures: results.length, errors }));
} catch (error) {
  await page.screenshot({ path: `${evidence}failure.png`, fullPage: false, animations: 'disabled' });
  await writeFile(`${evidence}ui-results.json`, JSON.stringify({ status: 'fail', message: String(error), results, errors }, null, 2));
  throw error;
} finally { await browser.close(); }
