// Desktop QA on an isolated local profile. All seed records were created by the mobile test.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const evidence = new URL('../evidence/desktop/', import.meta.url).pathname;
await mkdir(evidence, { recursive: true });
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176';
const fixture = JSON.parse(await readFile(new URL('../evidence/ukeire/synthetic-fixture.json', import.meta.url), 'utf8'));
for (let i = 0; i < 4; i++) {
  const source = fixture.problems[i % 2];
  const extra = { ...source, id: `desktop-extra-${i}`, title: `PC検証 ${i + 1}：手牌を振り返る` };
  if (i < 2) { extra.concealed = source.concealed.slice(0, 13); extra.drawn = i === 0 ? '8m' : '9m'; }
  if (i === 0) { extra.explanation = ''; extra.privateMemo = ''; }
  if (i === 2) { extra.title = 'PC検証：赤牌と副露を含む長いタイトルのカードで折り返しを確認する'; extra.concealed = source.concealed.slice(0, 11); extra.drawn = null; extra.melds = [{ id: 'desktop-red-pon', type: 'pon', from: 'left', tiles: ['5p','5p','0p'] }]; }
  fixture.problems.push(extra);
}
const browser = await chromium.launch({ headless: true, ...(process.env.MAHJONG_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MAHJONG_CHROMIUM_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
await context.addInitScript(seed => { if (!localStorage.getItem('mahjong-study:v1')) localStorage.setItem('mahjong-study:v1', JSON.stringify(seed)); }, fixture);
await context.route('**/*', async route => { const url = new URL(route.request().url()); if (url.origin === origin || url.protocol === 'data:') await route.continue(); else await route.abort(); });
const page = await context.newPage();
const errors = []; const results = [];
page.on('pageerror', error => errors.push(error.message));
const widths = [1280, 1440, 1920];
async function capture(name, selector, { preserveScroll = false } = {}) {
  if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
  else if (!preserveScroll) await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${evidence}${name}.png`, fullPage: false, animations: 'disabled' });
  const geometry = await page.evaluate(() => {
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
    const visible = el => el.getBoundingClientRect().width > 0;
    const boxes = selector => [...document.querySelectorAll(selector)].filter(visible).map(el => {
      const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height, hit: !!hit && el.contains(hit) };
    });
    const paneScrollers = [...document.querySelectorAll('.editor-workspace,.editor-main,.editor-tools')].filter(visible).map(el => ({
      className: el.className, overflowY: getComputedStyle(el).overflowY,
      scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
    }));
    return { width: innerWidth, height: innerHeight, document: document.documentElement.scrollWidth,
      documentScrollTop: document.scrollingElement.scrollTop, paneScrollers,
      nav: { top: nav.top, bottom: nav.bottom },
      overflow: [...document.querySelectorAll('.editor-workspace,.editor-main,.editor-tools,.remaining-panel,.tile-palette__row,.hand-strip,.problem-card,.view-tabs')].filter(visible).filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className),
      ctas: boxes('.sticky-actions .btn-save,.editor-save'),
      main: boxes('.editor-main')[0], tools: boxes('.editor-tools')[0],
      listColumns: document.querySelector('.problem-list') ? getComputedStyle(document.querySelector('.problem-list')).gridTemplateColumns.split(' ').length : null };
  });
  expect(geometry.document).toBeLessThanOrEqual(geometry.width); expect(geometry.overflow).toEqual([]);
  for (const cta of geometry.ctas) {
    expect(cta.hit).toBe(true); expect(cta.top).toBeGreaterThanOrEqual(geometry.width >= 1100 ? geometry.nav.bottom : 0);
    expect(cta.bottom).toBeLessThanOrEqual(geometry.width >= 1100 ? geometry.height : geometry.nav.top);
  }
  if (geometry.main && geometry.tools && geometry.width >= 1100) {
    expect(geometry.main.right).toBeLessThanOrEqual(geometry.tools.left);
    expect(Math.abs(geometry.main.width - geometry.tools.width)).toBeLessThanOrEqual(1);
  }
  for (const pane of geometry.paneScrollers) {
    expect(pane.scrollTop).toBe(0);
    expect(['auto', 'scroll'].includes(pane.overflowY) && pane.scrollHeight > pane.clientHeight + 1).toBe(false);
  }
  if (geometry.listColumns) expect(geometry.listColumns).toBe(geometry.width >= 1600 ? 3 : geometry.width >= 1100 ? 2 : 1);
  const header = await page.locator('.page--editor header').evaluateAll(headers => headers.map(el => {
    const box = node => { const r = node.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width}; };
    return { heading:box(el.querySelector('h1')), title:box(el.querySelector('.editor-title input')), actions:box(el.querySelector('.editor-header-actions')), titles:el.querySelectorAll('.editor-title input').length };
  }));
  for (const h of header) {
    expect(h.titles).toBe(1); expect(h.title.width).toBeGreaterThanOrEqual(120);
    if (geometry.width >= 1100) { expect(h.title.left).toBeGreaterThanOrEqual(h.heading.right); expect(h.title.right).toBeLessThanOrEqual(h.actions.left); }
  }
  const cardHands = await page.locator('.problem-card .hand-mini').evaluateAll(hands => hands.map(el => {
    const tiles=[...el.querySelectorAll('.hand-strip > .tile-face,.hand-strip > .tile-btn')];
    if(tiles.length!==14)return null;
    const first=tiles[0].getBoundingClientRect(),last=tiles[13].getBoundingClientRect(),card=el.getBoundingClientRect();
    return {count:tiles.length,firstWidth:first.width,lastWidth:last.width,firstTop:first.top,lastTop:last.top,firstBottom:first.bottom,lastBottom:last.bottom,lastRight:last.right,cardRight:card.right,separateDrawn:!!el.querySelector('.hand-view__drawn')};
  }).filter(Boolean));
  if(geometry.width>=1100)for(const hand of cardHands){
    expect(hand.separateDrawn).toBe(false);
    expect(Math.abs(hand.firstWidth-hand.lastWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(hand.firstTop-hand.lastTop)).toBeLessThanOrEqual(1);
    expect(Math.abs(hand.firstBottom-hand.lastBottom)).toBeLessThanOrEqual(1);
    expect(hand.lastRight).toBeLessThanOrEqual(hand.cardRight+1);
  }
  const scoreSuffixes = await page.locator('.ctx-score').evaluateAll(fields => fields.map(field => {
    const input = field.querySelector('input'); const suffix = field.querySelector('.score-suffix');
    const box = field.querySelector('.score-number'); const a = input.getBoundingClientRect(); const b = suffix.getBoundingClientRect();
    const style = getComputedStyle(box);
    return { inputRight: a.right, suffixLeft: b.left, suffix: suffix.textContent,
      groupBorder: parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth), groupBackground: style.backgroundColor };
  }));
  for (const field of scoreSuffixes) { expect(field.suffixLeft).toBeGreaterThanOrEqual(field.inputRight); expect(field.groupBorder).toBe(0); expect(field.groupBackground).toBe('rgba(0, 0, 0, 0)'); }
  results.push({ name, geometry, scoreSuffixes, header, cardHands });
}
async function allSizes(name, selector) { for (const width of widths) { await page.setViewportSize({ width, height: width === 1920 ? 1080 : 900 }); await capture(`${name}-${width}`, selector); } }
async function nav(name) { await page.getByRole('link', { name, exact: true }).click(); }
async function assertFocusedControlReachable(name, control) {
  await expect(control).toBeFocused();
  const geometry = await control.evaluate(el => {
    const r = el.getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
    const header = document.querySelector('.page--editor .page-header--compact').getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
      clearTop: Math.max(nav.bottom, header.bottom), viewportHeight: innerHeight, viewportWidth: innerWidth,
      hit: !!hit && el.contains(hit), focused: document.activeElement === el,
      documentScrollTop: document.scrollingElement.scrollTop };
  });
  expect(geometry.focused).toBe(true); expect(geometry.hit).toBe(true);
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.clearTop - 1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  results.push({ name, focusedControl: geometry });
  return geometry;
}
try {
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: '問題を作成' })).toBeVisible();
  await expect(page.locator('.tile-palette button:visible')).toHaveCount(37);
  expect(await page.locator('.ctx-score input').evaluateAll(inputs => inputs.map(input => input.value))).toEqual(['250', '250', '250', '250']);
  expect(await page.locator('.score-suffix').allTextContents()).toEqual(['00', '00', '00', '00']);
  await expect(page.locator('.editor-notes .editor-title')).toHaveCount(0);
  await expect(page.locator('.palette-limits')).toHaveCount(0);
  await page.getByLabel('タイトル（任意）',{exact:true}).fill('最初に入力したタイトル');
  await allSizes('editor-empty');
  await page.setViewportSize({ width: 1100, height: 768 });
  const eastScore = page.getByLabel('東の点数（百点単位）', { exact: true });
  const storeBeforeScoreCorrection = await page.evaluate(() => localStorage.getItem('mahjong-study:v1'));
  await eastScore.fill('25000');
  await expect(eastScore).toHaveValue('25000');
  await expect(eastScore).toHaveAttribute('aria-invalid', 'true');
  const applyExactScore = page.getByRole('button', { name: '東の点数を25,000点として反映', exact: true });
  await expect(applyExactScore).toBeVisible();
  await capture('scores-invalid-25000-1100', '.context-panel');
  await applyExactScore.click();
  await expect(eastScore).toHaveValue('250');
  await expect(eastScore).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('.score-input-error')).toHaveCount(0);
  await assertFocusedControlReachable('scores-corrected-focus-1100', eastScore);
  await capture('scores-corrected-focus-1100', undefined, { preserveScroll: true });
  expect(await page.evaluate(() => localStorage.getItem('mahjong-study:v1'))).toBe(storeBeforeScoreCorrection);
  await expect(page.getByRole('button', { name: '詳細入力', exact: true })).toHaveCount(0);
  for (const [label, value] of [['東','12345'],['南','100000'],['西','-100000'],['北','-25000']]) {
    await page.getByLabel(`${label}の点数（百点単位）`, { exact: true }).fill(value);
    await page.getByRole('button', { name: `${label}の点数を${Number(value).toLocaleString()}点として反映`, exact: true }).click();
  }
  expect(await page.locator('.ctx-score input').evaluateAll(inputs => inputs.map(input => input.value))).toEqual(['12345','100000','-100000','-250']);
  expect(await page.locator('.score-suffix').allTextContents()).toEqual(['点','点','点','00']);
  await capture('scores-exceptions-1100', '.ctx-scores');
  for (const label of ['東','南','西']) {
    const input = page.getByLabel(`${label}の点数（そのまま）`, { exact: true });
    await input.fill('25000'); await input.press('Tab');
    await expect(page.getByLabel(`${label}の点数（百点単位）`, { exact: true })).toHaveValue('250');
  }
  await page.getByLabel('北の点数（百点単位）', { exact: true }).fill('250');
  for (const name of ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','赤五索','五索','中','中']) await page.locator('.tile-palette').getByRole('button', { name, exact: true }).click();
  await expect(page.getByText('追加できない牌と理由',{exact:true})).toHaveCount(0);
  await allSizes('editor-hand');
  await page.locator('.editor-tools .ukeire-panel summary').click();
  await expect(page.locator('.ukeire-list > li:visible')).toHaveCount(3);
  await allSizes('editor-ukeire');
  await page.getByRole('button', { name: '残枚数', exact: true }).click();
  await page.locator('.remaining-suits button').filter({ hasText: '索子' }).click();
  await page.locator('.remaining-tile').filter({ has: page.getByRole('img', { name: '三索', exact: true }) }).click();
  await page.getByRole('textbox', { name: '三索の残枚数', exact: true }).fill('0');
  await allSizes('editor-remaining', '.remaining-panel');
  await page.getByRole('button', { name: '残枚数', exact: true }).click();
  await page.locator('.editor-notes > summary').click();
  await page.getByLabel('タイトル（任意）').fill('PC入力中の下書き');
  await page.getByLabel('解説', { exact: true }).fill('右の補足欄を開いても入力中の手牌と残数を保持');
  await allSizes('editor-notes', '.editor-notes');
  await eastScore.fill('275');
  const titleInput = page.getByLabel('タイトル（任意）');
  const titleNode = await titleInput.elementHandle();
  const scoreNode = await eastScore.elementHandle();
  for (const [index, width] of [1100, 1099, 1100, 1024, 1440].entries()) {
    await page.setViewportSize({ width, height: 768 });
    await expect(page.locator('.editor-workspace > :first-child')).toHaveClass('editor-main');
    await capture(`editor-breakpoint-${index + 1}-${width}`);
    expect(await page.locator('.editor-workspace').evaluate(el => getComputedStyle(el).display)).toBe(width >= 1100 ? 'grid' : 'block');
    await expect(titleInput).toHaveValue('PC入力中の下書き');
    await expect(eastScore).toHaveValue('275');
    expect(await titleInput.evaluate((node, previous) => node === previous, titleNode)).toBe(true);
    expect(await eastScore.evaluate((node, previous) => node === previous, scoreNode)).toBe(true);
  }
  await titleNode.dispose(); await scoreNode.dispose();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByLabel('自分のメモ（共有されません）').fill('低い画面でも追加情報へ届く');
  await capture('editor-short-notes', '.editor-notes');
  await page.locator('.editor-tools .ukeire-expand').click();
  await expect(page.locator('.editor-tools .ukeire-list > li:visible')).toHaveCount(13);
  await page.locator('.editor-notes > details > summary').click();
  const sourceInput = page.getByLabel('出典URL', { exact: true });
  const referenceInput = page.getByLabel('参考画像（最大3枚）', { exact: true });
  await capture('editor-short-all-open-top');
  await capture('editor-short-all-open-notes', '.editor-notes > summary');
  await sourceInput.click();
  await sourceInput.fill('https://example.invalid/desktop-review');
  await expect(sourceInput).toHaveValue('https://example.invalid/desktop-review');
  const sourceGeometry = await assertFocusedControlReachable('editor-short-reference-url', sourceInput);
  expect(sourceGeometry.documentScrollTop).toBeGreaterThan(0);
  await capture('editor-short-reference-url', undefined, { preserveScroll: true });
  // Keyboard traversal reaches the last input without opening a file chooser or uploading a file.
  await sourceInput.press('Tab');
  await assertFocusedControlReachable('editor-short-reference-last-input', referenceInput);
  await capture('editor-short-reference-last-input', undefined, { preserveScroll: true });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await capture('editor-short-all-open-bottom', undefined, { preserveScroll: true });
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.evaluate(() => document.documentElement.style.fontSize = '150%');
  await capture('editor-1100-text150-all-open-top');
  await sourceInput.click();
  await sourceInput.press('Tab');
  await assertFocusedControlReachable('editor-1100-text150-reference-last-input', referenceInput);
  await capture('editor-1100-text150-reference-last-input', undefined, { preserveScroll: true });
  await page.evaluate(() => document.documentElement.style.fontSize = '');
  await page.locator('.editor-notes > details > summary').click();
  await page.locator('.editor-tools .ukeire-expand').click();
  await expect(page.locator('.editor-tools .ukeire-list > li:visible')).toHaveCount(3);
  await page.locator('.editor-notes > summary').click();
  await page.evaluate(() => document.documentElement.style.fontSize = '150%');
  await capture('editor-1100-text150');
  await page.setViewportSize({ width: 1280, height: 720 });
  await capture('editor-1280-text150');
  await page.evaluate(() => document.documentElement.style.fontSize = '');
  await nav('学習帳');
  await expect(page.locator('.problem-card')).toHaveCount(6);
  await allSizes('library');
  await page.locator('.library-filters > summary').click();
  await capture('library-filters-1920', '.library-filters');
  await page.locator('.library-filters > summary').click();
  await page.locator('.problem-card').filter({hasText:'PC検証 1：手牌を振り返る'}).click();
  await expect(page.locator('.hand-stage .hand-strip > *')).toHaveCount(14);
  await expect(page.locator('.hand-view__drawn')).toHaveCount(0);
  await page.locator('.detail-tools > summary').click();
  const legacyPngDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'PNG保存',exact:true}).click();
  await (await legacyPngDownload).saveAs(`${evidence}legacy-unified-hand.png`);
  await nav('学習帳');
  await page.locator('.problem-card').filter({ hasText: '正解あり検証用の問題' }).click();
  await expect(page.getByRole('button', { name: '正解・解説を表示', exact: true })).toBeVisible();
  await allSizes('detail-hidden');
  await page.getByRole('button', { name: '正解・解説を表示', exact: true }).click();
  await allSizes('detail-shown');
  await page.getByRole('tab', { name: '受入れ', exact: true }).click();
  await allSizes('detail-ukeire', '.ukeire-panel');
  await nav('テスト'); await allSizes('test-setup');
  await page.getByLabel('正解ありのみ', { exact: true }).check();
  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: '1 問でテスト開始', exact: true }).click();
  await allSizes('test-question');
  await page.locator('.hand-stage').getByRole('button', { name: '中', exact: true }).first().click();
  await page.getByRole('button', { name: '回答する', exact: true }).click();
  await allSizes('test-answered');
  await page.getByRole('button', { name: '結果を見る', exact: true }).click();
  await nav('記録帳'); await allSizes('records');
  await nav('設定'); await allSizes('settings');
  await page.getByRole('tab', { name: 'データ管理', exact: true }).click(); await allSizes('settings-data');
  expect(errors).toEqual([]);
  await writeFile(`${evidence}desktop-results.json`, JSON.stringify({ status: 'pass', results, errors }, null, 2));
  console.log(JSON.stringify({ status: 'pass', desktopCaptures: results.filter(result => result.geometry).length, errors }));
} catch (error) {
  await page.screenshot({ path: `${evidence}failure.png`, fullPage: false, animations: 'disabled' });
  await writeFile(`${evidence}desktop-results.json`, JSON.stringify({ status: 'fail', message: String(error), results, errors }, null, 2));
  throw error;
} finally { await browser.close(); }
