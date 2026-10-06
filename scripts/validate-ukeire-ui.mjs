// Read-only browser QA against this checkout, using a fresh profile and synthetic data.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { openEditorNotes, discardFixtureDraft } from './editor-ui-helpers.mjs';
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
async function editFirstAnswer(enabled) {
  await page.getByRole('link',{name:'学習帳',exact:true}).click();
  await page.locator('.problem-card').first().click();
  await page.getByRole('link',{name:'編集',exact:true}).click();
  await openEditorNotes(page);
  await page.getByLabel('正解を設定する',{exact:true}).setChecked(enabled);
  if(enabled)await page.locator('.hand-stage--pick').getByRole('button',{name:'中',exact:true}).first().click();
  await page.getByRole('button',{name:'保存',exact:true}).click();
}

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
  const scoreWidths = await page.locator('.ctx-score input').evaluateAll(inputs => inputs.map(input => {
    const style = getComputedStyle(input);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = style.font;
    return { text: input.value, textWidth: context.measureText(input.value).width,
      available: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
  }));
  for (const score of scoreWidths) expect(score.textWidth).toBeLessThanOrEqual(score.available + 1);

  const headerControls = await page.locator('.page--editor header').evaluateAll(headers => headers.map(header => {
    const box=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};};
    const title=header.querySelector('.editor-title input'),save=header.querySelector('.editor-save');
    return {title:box(title),save:box(save),heading:box(header.querySelector('h1'))};
  }));
  const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
  for(const header of headerControls){expect(header.title.width).toBeGreaterThanOrEqual(120);expect(overlaps(header.title,header.save)).toBe(false);expect(overlaps(header.title,header.heading)).toBe(false);}
  const scoreSuffixes = await page.locator('.ctx-score').evaluateAll(fields => fields.map(field => {
    const input = field.querySelector('input'); const suffix = field.querySelector('.score-suffix');
    const box = field.querySelector('.score-number'); const a = input.getBoundingClientRect(); const b = suffix.getBoundingClientRect();
    const style = getComputedStyle(box);
    return { inputRight: a.right, suffixLeft: b.left, suffix: suffix.textContent,
      groupBorder: parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth), groupBackground: style.backgroundColor };
  }));
  for (const field of scoreSuffixes) { expect(field.suffixLeft).toBeGreaterThanOrEqual(field.inputRight); expect(field.groupBorder).toBe(0); expect(field.groupBackground).toBe('rgba(0, 0, 0, 0)'); }
  results.push({ name, geometry, scoreSuffixes, headerControls, ...(cta ? { cta } : {}), ...(scoreWidths.length ? { scoreWidths } : {}) });
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
  await expect(page.getByLabel('局', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('巡目', { exact: true })).toHaveValue('6');
  await expect(page.locator('.wanpai').getByRole('button', { name: '北', exact: true })).toHaveCount(1);
  expect(await page.locator('.ctx-score input').evaluateAll(inputs => inputs.map(input => input.value))).toEqual(['250','250','250','250']);
  expect(await page.locator('.score-suffix').allTextContents()).toEqual(['00','00','00','00']);
  const order = await page.evaluate(() => ({
    contextBottom: document.querySelector('.context-panel').getBoundingClientRect().bottom,
    handTop: document.querySelector('.hand-stage').getBoundingClientRect().top,
    inputTargets: [...document.querySelectorAll('.target-tabs button')].map(el => el.textContent.trim()),
  }));
  expect(order.contextBottom).toBeLessThanOrEqual(order.handTop);
  expect(order.inputTargets).toEqual(['手牌','ドラ表示牌','明順子','明刻子','明槓子','暗槓子','加槓子']);
  results.push({ name: 'continuous-editor-flow', order, mixedInputClicks: 14, suitSwitchClicks: 0 });
  await expect(page.getByLabel('タイトル（任意）',{exact:true})).toBeVisible();
  await expect(page.locator('.editor-notes .editor-title')).toHaveCount(0);
  await expect(page.locator('.palette-limits')).toHaveCount(0);
  await allSizes('editor-empty');
  for (const width of [375,390]) {
    await page.setViewportSize({width,height:844});
    const field=page.getByLabel('東の点数（百点単位）',{exact:true});
    await field.fill('999'); await expect(field).toBeFocused();
    await capture(`scores-999-focused-${width}`, '.ctx-scores');
    await field.fill('250'); await field.press('Tab');
  }

  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByLabel('東の点数（百点単位）', { exact: true }).fill('0');
  await page.getByLabel('南の点数（百点単位）', { exact: true }).fill('999');
  await page.getByLabel('西の点数（百点単位）', { exact: true }).fill('');
  await page.getByLabel('北の点数（百点単位）', { exact: true }).fill('-25');
  await capture('scores-edited-320', '.ctx-scores');
  await page.getByLabel('東の点数（百点単位）', { exact: true }).fill('1000');
  await expect(page.getByLabel('東の点数（百点単位）', { exact: true })).toHaveValue('1000');
  await expect(page.getByLabel('東の点数（百点単位）', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('mahjong-study:v1'))).toBeNull();
  await capture('scores-invalid-320', '.score-input-error');
  await page.getByRole('button', { name: '東の点数を1,000点として反映', exact: true }).click();
  await expect(page.getByLabel('東の点数（百点単位）', { exact: true })).toHaveValue('10');
  await page.getByLabel('東の点数（百点単位）', { exact: true }).fill('25000');
  await page.getByRole('button', { name: '東の点数を25,000点として反映', exact: true }).click();
  await expect(page.getByLabel('東の点数（百点単位）', { exact: true })).toHaveValue('250');
  await expect(page.getByLabel('東の点数（百点単位）', { exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: '詳細入力', exact: true })).toHaveCount(0);
  for (const [label, value] of [['東','12345'],['南','100000'],['西','-100000'],['北','-25000']]) {
    await page.getByLabel(`${label}の点数（百点単位）`, { exact: true }).fill(value);
    await page.getByRole('button', { name: `${label}の点数を${Number(value).toLocaleString()}点として反映`, exact: true }).click();
  }
  expect(await page.locator('.ctx-score input').evaluateAll(inputs => inputs.map(input => input.value))).toEqual(['12345','100000','-100000','-250']);
  expect(await page.locator('.score-suffix').allTextContents()).toEqual(['点','点','点','00']);
  await capture('scores-exceptions-320', '.ctx-scores');
  for (const label of ['東','南','西']) {
    const input = page.getByLabel(`${label}の点数（そのまま）`, { exact: true });
    await input.fill('25000'); await input.press('Tab');
    await expect(page.getByLabel(`${label}の点数（百点単位）`, { exact: true })).toHaveValue('250');
  }
  await page.getByLabel('北の点数（百点単位）', { exact: true }).fill('250');

  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await targets('.tile-actions button,.editor-save');
  }
  for (const name of ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','赤五索','五索','中','中']) await pick(name);
  await expect(page.locator('.ukeire-list > li')).toHaveCount(13);
  await expect(page.locator('.ukeire-list > li:not([hidden])')).toHaveCount(3);
  await expect(page.locator('.ukeire-title')).toBeVisible();
  await expect(page.locator('.ukeire-list > li:visible')).toHaveCount(3);
  await expect(page.getByText('追加できない牌と理由',{exact:true})).toHaveCount(0);
  const editorRows = await page.locator('.ukeire-list').textContent();
  const toolbar = page.locator('.tile-actions');
  expect(await toolbar.locator('button').allTextContents()).toEqual(['理牌', '戻す', '全消去', '残枚数']);
  await allSizes('editor-hand');
  await allSizes('editor-ukeire-top3', '.ukeire-panel');
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
  await openEditorNotes(page);
  await page.getByLabel('タイトル（任意）').fill('スマホ検証用の問題');
  await page.getByLabel('解説', { exact: true }).fill('検証用の短い解説です。');
  await allSizes('editor-notes', '.editor-notes');
  // This first saved fixture deliberately stays answerless for the zero-candidate test.
  await page.getByLabel('正解を設定する', { exact: true }).uncheck();
  await expect(page.getByLabel('テストに出題する', { exact: true })).toHaveCount(0);
  await page.locator('.editor-notes > summary').click();
  await page.getByLabel('本場', { exact: true }).fill('2');
  await allSizes('editor-context');
  await expect(page.getByRole('textbox', { name: '三索の残枚数', exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: 'すべて自動に戻す', exact: true }).click();
  await toolbar.getByRole('button', { name: '残枚数', exact: true }).click();
  await expect(page.locator('.ukeire-title')).toBeVisible();
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
  await expect(page.getByLabel('正解ありのみ', { exact: true })).toHaveCount(0);
  await expect(page.locator('.count-pill')).toContainText('0 問');
  await expect(page.getByRole('button', { name: '条件に合う問題がありません', exact: true })).toBeDisabled();
  await capture('test-answer-only-empty-390');
  await editFirstAnswer(true);
  await page.getByRole('link',{name:'テスト',exact:true}).click();
  await allSizes('test-setup');
  await page.getByRole('button', { name: '1 問でテスト開始', exact: true }).click();
  await expect(page.locator('.ukeire-panel')).toHaveCount(0);
  await expect(page.locator('#answer-view-tab-notes')).toHaveCount(0);
  await allSizes('test-question');
  await page.locator('.hand-stage').getByRole('button',{name:'中',exact:true}).first().click();
  await page.getByRole('button',{name:'回答する',exact:true}).click();
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
  await editFirstAnswer(false);
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
  for (const name of ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','赤五索','五索','中','中']) await pick(name);
  await openEditorNotes(page);
  await page.getByLabel('タイトル（任意）').fill('正解あり検証用の問題');
  await page.getByLabel('正解を設定する', { exact: true }).check();
  await page.locator('.hand-stage--pick').getByRole('button', { name: '中', exact: true }).first().click();
  await page.getByLabel('解説', { exact: true }).fill('正解表示を開いた後の検証用解説');
  await page.getByLabel('自分のメモ（共有されません）').fill('正解表示を開いた後の私用メモ');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('heading', { name: '正解あり検証用の問題' })).toBeVisible();
  await expect(page.locator('.hand-stage .is-correct')).toHaveCount(0);
  await expect(page.getByText('正解表示を開いた後の検証用解説', { exact: true })).toHaveCount(0);
  await expect(page.getByText('正解表示を開いた後の私用メモ', { exact: true })).toHaveCount(0);
  await allSizes('answer-hidden');
  const beforeReveal = await page.evaluate(() => localStorage.getItem('mahjong-study:v1'));
  await page.getByRole('button', { name: '正解・解説を表示', exact: true }).click();
  await expect(page.locator('.hand-stage .is-correct')).toHaveCount(2);
  await expect(page.getByText('正解表示を開いた後の検証用解説', { exact: true })).toBeVisible();
  await allSizes('answer-visible');
  await page.getByRole('button', { name: '正解・解説を隠す', exact: true }).click();
  await expect(page.locator('.hand-stage .is-correct')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('mahjong-study:v1'))).toBe(beforeReveal);
  await page.getByRole('link', { name: '学習帳', exact: true }).click();
  await expect(page.getByLabel('正解を表示', { exact: true })).not.toBeChecked();
  await expect(page.locator('.problem-card .is-correct')).toHaveCount(0);
  await page.getByLabel('正解を表示', { exact: true }).check();
  await expect(page.locator('.problem-card .is-correct')).toHaveCount(2);
  await allSizes('library-answer-visible');
  await page.getByLabel('正解を表示', { exact: true }).uncheck();
  await expect(page.locator('.problem-card .is-correct')).toHaveCount(0);
  await page.getByRole('link', { name: 'テスト', exact: true }).click();
  await expect(page.getByLabel('正解ありのみ', { exact: true })).toHaveCount(0);
  await expect(page.locator('.count-pill')).toContainText('1 問');
  await allSizes('test-answer-only');
  await page.getByRole('button', { name: '1 問でテスト開始', exact: true }).click();
  await expect(page.locator('.test-title')).toHaveText('正解あり検証用の問題');
  await expect(page.locator('.hand-stage .is-correct')).toHaveCount(0);
  await expect(page.getByText('正解表示を開いた後の検証用解説', { exact: true })).toHaveCount(0);
  await page.locator('.hand-stage').getByRole('button', { name: '中', exact: true }).first().click();
  await page.getByRole('button', { name: '回答する', exact: true }).click();
  await expect(page.locator('.verdict')).toHaveText('正解');
  await expect(page.getByText('正解表示を開いた後の検証用解説', { exact: true })).toBeVisible();
  await capture('test-answer-only-correct-390');
  await page.getByRole('button', { name: '結果を見る', exact: true }).click();
  const filteredData = await page.evaluate(() => JSON.parse(localStorage.getItem('mahjong-study:v1')));
  await writeFile(`${evidence}synthetic-fixture.json`, JSON.stringify(filteredData));
  expect(filteredData.attempts).toHaveLength(2);
  const answeredId = filteredData.problems.find(problem => problem.title === '正解あり検証用の問題').id;
  expect(filteredData.attempts[1].problemId).toBe(answeredId);
  await page.getByRole('link', { name: '作成', exact: true }).click();
  await page.evaluate(() => document.documentElement.style.fontSize = '150%');
  await page.setViewportSize({ width: 320, height: 720 });
  await capture('editor-320-text150');
  await page.getByLabel('東の点数（百点単位）',{exact:true}).fill('-100000');
  await page.getByRole('button',{name:'東の点数を-100,000点として反映',exact:true}).click();
  await capture('scores-exception-320-text150', '.ctx-scores');
  await page.getByLabel('東の点数（そのまま）',{exact:true}).fill('25000');
  await page.getByLabel('東の点数（そのまま）',{exact:true}).press('Tab');

  await page.getByLabel('東の点数（百点単位）',{exact:true}).click();
  for (const key of ['Tab','Tab','Tab','Shift+Tab','Shift+Tab','Shift+Tab']) {
    await page.keyboard.press(key);
    const focusedScore = await page.evaluate(() => {
      const el=document.activeElement,r=el.getBoundingClientRect(),header=document.querySelector('.page--editor header').getBoundingClientRect(),nav=document.querySelector('.bottom-nav').getBoundingClientRect();
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {label:el.getAttribute('aria-label'),top:r.top,bottom:r.bottom,headerBottom:header.bottom,navTop:nav.top,hit:!!hit && el.contains(hit)};
    });
    expect(focusedScore.hit).toBe(true);expect(focusedScore.top).toBeGreaterThanOrEqual(focusedScore.headerBottom-1);expect(focusedScore.bottom).toBeLessThanOrEqual(focusedScore.navTop);
    results.push({name:'editor-score-keyboard-text150',key,focusedScore});
  }
  await page.screenshot({path:`${evidence}editor-score-keyboard-text150.png`,fullPage:false,animations:'disabled'});
  await targets('.tile-actions button,.editor-save');
  await openEditorNotes(page); await capture('notes-320-text150', '.editor-notes');
  await page.locator('.editor-notes > summary').click();
  for (const name of ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','五索','中','中']) await pick(name);
  await page.getByRole('button', { name: '残枚数', exact: true }).click();
  await capture('remaining-320-text150', '.remaining-panel');
  await targets('.remaining-panel button,.remaining-panel input');
  await page.getByRole('textbox', { name: '一萬の残枚数', exact: true }).focus();
  await page.setViewportSize({ width: 320, height: 480 });
  await page.getByRole('textbox', { name: '一萬の残枚数', exact: true }).scrollIntoViewIfNeeded();
  await capture('remaining-320-shortviewport', '.remaining-control');
  await page.evaluate(() => document.documentElement.style.fontSize = '');
  await page.getByRole('link', { name: '学習帳', exact: true }).click();
  await discardFixtureDraft(page);
  await page.getByRole('link', { name: '作成', exact: true }).click();
  for (const name of ['一萬','一萬','一萬','二萬','三萬','四萬','五萬','六萬','七萬','一筒','二筒','三筒','一索','二索']) await pick(name);
  await expect(page.locator('.ukeire-title')).toBeVisible();
  expect(await page.locator('.ukeire-list > li:visible .ukeire-discard').evaluateAll(elements => elements.map(el => el.getAttribute('aria-label')))).toEqual(['一萬を切る','四萬を切る','七萬を切る']);
  expect(await page.locator('.ukeire-list > li:visible .ukeire-row__heading > strong').allTextContents()).toEqual(['テンパイ','テンパイ','テンパイ']);
  const retreat = page.locator('.ukeire-row').filter({ has: page.getByLabel('二萬を切る', { exact: true }) });
  await expect(retreat).not.toBeVisible(); await expect(retreat).toContainText('32枚');
  await allSizes('ukeire-minimum-shanten', '.ukeire-panel');
  await page.locator('.ukeire-expand').click(); await expect(retreat).toBeVisible();
  await capture('ukeire-all-shanten-390', '.ukeire-list');
  await page.locator('.ukeire-expand').click();
  await page.getByRole('button', { name: '残枚数', exact: true }).click();
  await fillRemaining('三索', '0');
  expect(await page.locator('.ukeire-list > li:visible .ukeire-row__heading > strong').allTextContents()).toEqual(['テンパイ','テンパイ','テンパイ']);
  await capture('ukeire-minimum-adjusted-390', '.ukeire-panel');
  expect(errors).toEqual([]);
  await writeFile(`${evidence}ui-results.json`, JSON.stringify({ status: 'pass', results, errors }, null, 2));
  console.log(JSON.stringify({ status: 'pass', captures: results.length, errors }));
} catch (error) {
  await page.screenshot({ path: `${evidence}failure.png`, fullPage: false, animations: 'disabled' });
  await writeFile(`${evidence}ui-results.json`, JSON.stringify({ status: 'fail', message: String(error), results, errors }, null, 2));
  throw error;
} finally { await browser.close(); }
