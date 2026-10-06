// CI-only DOPA representatives. Uses isolated synthetic profiles and the local Vite dev server.
// It exercises rendered controls; it does not test OCR accuracy or every application error branch.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const out = new URL('../evidence/dopa-buttons/', import.meta.url).pathname;
const origin = new URL(process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) {
  throw new Error('This synthetic-profile check requires a loopback Vite server.');
}
await mkdir(out, { recursive: true });
const revision = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim(),
};
const png = await readFile(new URL('../public/tiles/man1.png', import.meta.url));
const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
const when = '2026-10-05T00:00:00Z';
const hand = ['1m','2m','3m','1p','2p','3p','1s','2s','3s','4s','0s','5s','7z','7z'];
const problem = {
  id: 'button-question', title: '合成ボタン確認', concealed: hand, drawn: null, melds: [],
  doraIndicators: ['4z'], answerEnabled: true, acceptedDiscards: ['7z'], explanation: '合成の解説',
  privateMemo: '', tagIds: ['button-tag'], sourceUrl: '', createdAt: when, updatedAt: when,
  context: { roundWind: '1z', handNumber: 1, seatWind: '1z', turn: 6, honba: 0, riichiSticks: 0,
    ownRank: null, scores: { east: 25000, south: 25000, west: 25000, north: 25000 } },
  attachments: [{ id: 'button-image', dataUrl, width: png.readUInt32BE(16), height: png.readUInt32BE(20), role: 'question' }],
};
const seed = {
  schemaVersion: 1, revision: 0,
  problems: [problem, { ...problem, id: 'button-question-2', title: '合成ボタン確認２' }],
  tags: [{ id: 'button-tag', name: '確認タグ' }],
  study: ['button-question', 'button-question-2'].map(problemId => ({ problemId, contentRevision: 0,
    confirmationCount: 0, lastConfirmedAt: null, understanding: 'unrated', lastReviewedAt: null, inTest: true })),
  attempts: [], settings: { autoSort: true }, daily: {},
  materials: [{ id: 'button-material', title: '合成教材', url: 'https://example.com/lesson', comment: '', createdAt: when, updatedAt: when }],
  materialStudyEvents: [],
};
const familyDefinitions = {
  btn: [false, true], 'test-count': [false, true], seg: [true, true], 'target-tabs': [true, false],
  'view-tabs': [true, false], 'tile-btn': [true, true], 'meld-btn': [false, false],
  'palette-suits': [true, false], 'remaining-suits': [true, false], 'remaining-tile': [true, false],
  'remaining-reset-all': [false, false], 'filter-chip': [true, false], 'tag-chip': [true, false],
  'theme-option': [true, false], 'read-cell': [true, false], 'attachment-thumbnail': [false, false],
};
const coverage = Object.fromEntries(Object.entries(familyDefinitions).map(([family, [selected, disabled]]) => [family, {
  normal: 'not_run', hover: 'not_run', active: 'not_run', focus: 'not_run',
  selected: selected ? 'not_run' : 'N/A: no selection state', disabled: disabled ? 'not_run' : 'N/A: no disabled state',
}]));
const results = [], errors = [], externalRequests = [], contexts = [];
let importStubRequests = 0;
let page;
const browser = await chromium.launch({ headless: true });

async function open(route = '/', profile = seed, { importFixture = false } = {}) {
  // Width emulation uses a desktop Chromium input context. Touch-device hover is not claimed.
  const context = await browser.newContext({ viewport: { width: 375, height: 844 }, serviceWorkers: 'block' });
  contexts.push(context);
  await context.addInitScript(profile => {
    if (!localStorage.getItem('mahjong-study:v1')) localStorage.setItem('mahjong-study:v1', JSON.stringify(profile));
    localStorage.setItem('mahjong-study:theme', 'dopa');
  }, profile);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { externalRequests.push(url.href); return route.abort(); }
    if (importFixture && url.pathname === '/src/features/import/autoRead.ts') {
      importStubRequests++;
      // The real ImportPage/recognize.loadImage/correction UI stays intact. No source or production hook is changed.
      return route.fulfill({ contentType: 'text/javascript', body: `
        export const GAME_NAMES = { jantama: '雀魂' };
        export const loadLocalBanks = () => ({});
        export const loadModel = async () => ({});
        export const prepareModel = () => ({ jantama: { tiles: [] } });
        export const rememberTile = () => {};
        export const rematchCell = cell => cell;
        export const autoRead = () => ({ game: 'jantama',
          hand: ['1m','2m','3m'].map((label, i) => ({ label, sure: i !== 1,
            feat: new Uint8Array(0), preview: ${JSON.stringify(dataUrl)}, rotated: false })),
          melds: [], dora: [], roundWind: '1z', handNumber: 1, honba: 0, riichiSticks: 0,
          seatWind: '1z', turn: 6, players: 4,
          scores: { self: 25000, right: 25000, across: 25000, left: 25000 }, estimated: [] });
      ` });
    }
    return route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/#${route}`);
  await page.locator('.page').waitFor();
  // Leave finite entrance animations running; pausing them can strand content at opacity zero.
  // Screenshots freeze animations; comparisons below deliberately exclude animated background-position.
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
  await page.evaluate(() => document.fonts.ready);
  return context;
}
async function go(route) {
  await page.goto(`${origin}/#${route}`);
  const selector = route.startsWith('/materials/') ? '.page--material-detail'
    : { '/settings': '.page--settings', '/records': '.page--records' }[route];
  await page.locator(selector ?? '.page').waitFor();
}
async function frame(name, target) {
  if (target) await target.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
    documentWidth: document.documentElement.scrollWidth, rootFont: getComputedStyle(document.documentElement).fontSize }));
  expect(geometry.documentWidth, `${name}: document overflow`).toBeLessThanOrEqual(geometry.width);
  await page.screenshot({ path: `${out}${name}.png`, animations: 'disabled' });
  results.push({ name, screenshot: `${name}.png`, ...geometry });
}
async function snapshot(locator) {
  await expect(locator).toBeVisible();
  await locator.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await expect.poll(() => locator.evaluate(el => [...el.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0))).toBe(true);
  return locator.evaluate(el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { text: el.textContent?.trim(), label: el.getAttribute('aria-label'), color: s.color,
      background: s.backgroundColor, image: s.backgroundImage, opacity: s.opacity, cursor: s.cursor,
      shadow: s.boxShadow, animation: s.animationName, visibility: s.visibility,
      outline: { color: s.outlineColor, width: s.outlineWidth, offset: s.outlineOffset, style: s.outlineStyle },
      width: r.width, height: r.height, hit: el === hit || el.contains(hit), disabled: el.disabled === true,
      selected: el.getAttribute('aria-selected') ?? el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked')
        ?? ['is-on', 'is-active', 'is-selected'].some(className => el.classList.contains(className)),
      images: [...el.querySelectorAll('img')].map(img => ({ src: img.getAttribute('src'), width: img.naturalWidth, height: img.naturalHeight })) };
  });
}
function visible(value, name) {
  expect(value.visibility, name).toBe('visible');
  expect(Number(value.opacity), name).toBeGreaterThan(0);
  expect(value.width, name).toBeGreaterThan(0); expect(value.height, name).toBeGreaterThan(0);
  expect(Boolean(value.text || value.label || value.images.length), name).toBe(true);
  expect(value.hit, `${name}: center hit target`).toBe(true);
}
async function state(family, stateName, locator, name = `${family}-${stateName}`) {
  const value = await snapshot(locator); visible(value, name);
  if (stateName === 'selected') expect([true, 'true'], `${name}: selected semantics`).toContain(value.selected);
  coverage[family][stateName] = 'automated_pass';
  results.push({ name, family, state: stateName, viewport: page.viewportSize(), value });
  return value;
}
async function contrast(name, locator, backingVariable) {
  // Only designated opaque solid surfaces are compared. Disabled/photo/gradient pixels are excluded.
  const pair = await locator.evaluate((el, variable) => ({ foreground: getComputedStyle(el).color,
    background: variable ? getComputedStyle(el).getPropertyValue(variable).trim() : getComputedStyle(el).backgroundColor,
  }), backingVariable);
  const rgb = value => value.startsWith('#') ? value.slice(1).match(/../g).map(channel => parseInt(channel, 16))
    : value.match(/[\d.]+/g).slice(0, 3).map(Number);
  const luminance = value => rgb(value).map(channel => { const c = channel / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; })
    .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  const a = luminance(pair.foreground), b = luminance(pair.background);
  const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  expect(ratio, `${name}: solid text contrast`).toBeGreaterThanOrEqual(4.5);
  results.push({ name, ...pair, ratio, scope: 'computed opaque colors only' });
}
async function focusWithTab(locator, name) {
  // Start at its preceding real tab stop, then enter the target with Tab. Never count focus() alone.
  await locator.evaluate(el => {
    const stops = [...document.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]')]
      .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
    const index = stops.indexOf(el);
    if (index < 0) throw new Error('The focus representative is not a real tab stop');
    if (index > 0) stops[index - 1].focus();
    else { const anchor = document.createElement('span'); anchor.tabIndex = 0; el.before(anchor); anchor.focus();
      anchor.addEventListener('blur', () => anchor.remove(), { once: true }); }
  });
  await page.keyboard.press('Tab');
  await expect(locator).toBeFocused();
  expect(await locator.evaluate(el => el.matches(':focus-visible'))).toBe(true);
  await frame(name, locator);
  const clipping = await locator.evaluate(el => {
    const box = node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
    const ancestors = []; let parent = el.parentElement;
    while (parent) { const s = getComputedStyle(parent);
      if ([s.overflowX, s.overflowY].some(value => ['hidden','clip','auto','scroll'].includes(value)))
        ancestors.push({ className: parent.className, overflowX: s.overflowX, overflowY: s.overflowY, box: box(parent) });
      parent = parent.parentElement;
    }
    const s = getComputedStyle(el);
    return { box: box(el), outlineWidth: s.outlineWidth, outlineOffset: s.outlineOffset, ancestors,
      visualReview: 'pending: inspect all four edges in the screenshot; computed outline alone is not a pass' };
  });
  results.push({ name: `${name}-clip-geometry`, ...clipping });
}
async function representative(family, locator, { mouse = true } = {}) {
  await state(family, 'normal', locator);
  await frame(`${family}-normal-375`, locator);
  await focusWithTab(locator, `${family}-focus-375`);
  await state(family, 'focus', locator);
  coverage[family].focus = 'keyboard_pass_visual_review_pending';
  if (!mouse) return;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.mouse.move(1, 1);
  const normal = await snapshot(locator);
  await locator.hover();
  const hover = await state(family, 'hover', locator);
  await frame(`${family}-hover-1440`, locator);
  await page.mouse.down();
  try {
    const active = await state(family, 'active', locator);
    for (const [label, value] of [['hover', hover], ['active', active]]) {
      expect(Math.abs(value.width - normal.width), `${family} ${label} width`).toBeLessThan(1);
      expect(Math.abs(value.height - normal.height), `${family} ${label} height`).toBeLessThan(1);
      expect(value.color, `${family} ${label} text color`).toBe(normal.color);
      expect(value.image, `${family} ${label} background image`).toBe(normal.image);
      expect(value.opacity, `${family} ${label} opacity`).toBe(family === 'meld-btn' && label === 'active' ? '0.6' : normal.opacity);
    }
    await frame(`${family}-active-1440`, locator);
  } finally { await page.mouse.move(1, 1); await page.mouse.up(); }
  await page.setViewportSize({ width: 375, height: 844 });
}
async function disabled(family, locator, name, expectedOpacity) {
  await expect(locator).toBeDisabled();
  const value = await state(family, 'disabled', locator, name);
  if (expectedOpacity) expect(value.opacity).toBe(expectedOpacity);
  if (family === 'btn') {
    expect(value.opacity).toBe('0.45'); expect(value.cursor).toBe('default');
    expect(value.shadow).toBe('none'); expect(value.animation).toBe('none');
  }
  const events = await locator.evaluate(el => {
    let clicks = 0; const count = () => clicks++; el.addEventListener('click', count);
    el.click(); el.removeEventListener('click', count); el.focus();
    return { clicks, focused: document.activeElement === el, nativeDisabled: el.matches(':disabled') };
  });
  expect(events).toEqual({ clicks: 0, focused: false, nativeDisabled: true });
  // Native disabled buttons must also be skipped by actual keyboard navigation.
  await locator.evaluate(el => {
    const before = [...document.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]')]
      .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length && (node.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
    before.at(-1)?.focus();
  });
  await page.keyboard.press('Tab'); await expect(locator).not.toBeFocused();
  results.push({ name: `${name}-native-disabled`, ...events, skippedByTab: true });
  await frame(name, locator);
  return value;
}
async function cta(name, selector) {
  const parent = page.locator(selector), button = parent.locator('button.btn-primary');
  const paint = await parent.evaluate(el => ({ image: getComputedStyle(el).backgroundImage, color: getComputedStyle(el).backgroundColor }));
  expect(paint).toEqual({ image: 'none', color: 'rgba(0, 0, 0, 0)' });
  const value = await snapshot(button); visible(value, name);
  expect(value.image).toContain('linear-gradient'); expect(value.height).toBeGreaterThanOrEqual(48);
  if (!value.disabled) expect(value.shadow).not.toBe('none');
  await frame(name, parent); results.push({ name: `${name}-paint`, paint, button: value });
}
async function changedWidths(name, callback) {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 }); await callback(`${name}-${width}`);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => document.documentElement.style.fontSize = '150%');
  await callback(`${name}-320-text150`);
  await page.evaluate(() => document.documentElement.style.fontSize = '');
  await page.setViewportSize({ width: 375, height: 844 });
}

try {
  // 1. Empty editor, enabled restoration, and the clipping-prone focus representatives.
  await open();
  const undo = page.getByRole('button', { name: '戻す', exact: true });
  await disabled('btn', undo, 'editor-undo-disabled', '0.45');
  await disabled('btn', page.getByRole('button', { name: '残枚数', exact: true }), 'editor-remaining-disabled');
  await changedWidths('editor-disabled', async name => { await disabled('btn', undo, name); });
  await representative('btn', page.getByRole('button', { name: '理牌', exact: true }));
  const primary = await snapshot(page.locator('.editor-save'));
  expect(primary.color).toBe('rgb(244, 243, 255)'); expect(primary.shadow).not.toBe('none');
  const danger = await snapshot(page.getByRole('button', { name: '全消去', exact: true }));
  expect(danger.color).toBe('rgb(255, 155, 181)'); results.push({ name: 'primary-danger-colors', primary, danger });
  await contrast('primary-solid-surface-contrast', page.locator('.editor-save'), '--surface');
  await contrast('danger-solid-surface-contrast', page.getByRole('button', { name: '全消去', exact: true }), '--surface');
  const decoration = await page.locator('.context-panel').evaluate(el => getComputedStyle(el, '::before').pointerEvents);
  expect(decoration).toBe('none'); results.push({ name: 'panel-decoration-hit-testing', pointerEvents: decoration });
  await page.locator('.editor-palette').getByRole('button', { name: '一萬', exact: true }).click();
  await expect(undo).toBeEnabled();
  const restored = await snapshot(undo);
  expect(restored.opacity).toBe('1'); expect(restored.shadow).not.toBe('none'); expect(restored.animation).toBe('dopa-rainbow-flow');
  await frame('editor-undo-enabled', undo); results.push({ name: 'undo-restored', restored }); await undo.click();
  const wind = page.getByRole('group', { name: '場風', exact: true }).getByRole('button').first();
  await representative('seg', wind); await wind.click(); await state('seg', 'selected', wind);
  await contrast('selected-seg-contrast', wind);
  const target = page.getByRole('tab', { name: 'ドラ表示牌', exact: true });
  await representative('target-tabs', target); await target.click(); await state('target-tabs', 'selected', target);
  await changedWidths('focus-clipping', async name => {
    await focusWithTab(wind, `${name}-seg`); await focusWithTab(target, `${name}-scroll-target`);
  });
  await page.getByRole('tab', { name: '明順子', exact: true }).click();
  await disabled('seg', page.getByRole('group', { name: '取得元', exact: true }).locator('button:disabled').first(), 'chi-from-disabled', '0.35');
  await page.getByRole('tab', { name: '手牌', exact: true }).click();
  const paletteTile = page.locator('.editor-palette').getByRole('button', { name: '一萬', exact: true });
  await representative('tile-btn', paletteTile);
  for (let i = 0; i < 4; i++) await paletteTile.click();
  await disabled('tile-btn', paletteTile, 'fifth-copy-disabled', '0.45');

  // 2. Setup bounds/filters, answer disabled/enabled, wrong and correct marks, result action.
  await open('/test');
  const count = page.getByRole('spinbutton', { name: '問題数', exact: true });
  const minus = page.getByRole('button', { name: '問題数を減らす', exact: true });
  const plus = page.getByRole('button', { name: '問題数を増やす', exact: true });
  await representative('test-count', minus);
  await disabled('test-count', plus, 'count-maximum', '0.45'); await minus.click();
  await disabled('test-count', minus, 'count-minimum', '0.45');
  await page.locator('.page--test details > summary').click();
  const tagFilter = page.locator('.filter-chip').filter({ has: page.locator('strong', { hasText: /^タグ$/ }) });
  await representative('filter-chip', tagFilter); await tagFilter.click(); await state('filter-chip', 'selected', tagFilter);
  await contrast('selected-filter-muted-contrast', tagFilter.locator('span'), '--accent-soft');
  const tag = page.getByRole('button', { name: '確認タグ', exact: true });
  await representative('tag-chip', tag); await tag.click(); await state('tag-chip', 'selected', tag);
  // An empty draft makes start disabled without leaving the edit field (blur normalizes the count).
  await count.fill(''); await expect(page.locator('.test-start-actions button')).toBeDisabled();
  const invalidStart = await snapshot(page.locator('.test-start-actions button'));
  expect(invalidStart.opacity).toBe('0.45'); results.push({ name: 'start-invalid-count', value: invalidStart });
  await count.fill('1'); await count.press('Tab');
  await changedWidths('test-start', name => cta(name, '.page--test > .sticky-actions'));
  await page.locator('.test-start-actions button').click();
  const answer = page.getByRole('button', { name: '回答する', exact: true });
  await disabled('btn', answer, 'answer-disabled');
  expect(await answer.locator('..').evaluate(el => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
  const choice = page.locator('.hand-strip').getByRole('button', { name: '一萬', exact: true }).first();
  await choice.click(); await state('tile-btn', 'selected', choice);
  await expect(answer).toBeEnabled(); expect((await snapshot(answer)).shadow).not.toBe('none'); await answer.click();
  await expect(page.locator('.verdict')).toHaveText('不正解');
  await expect(page.locator('.is-wrong, .tile-mark--wrong')).not.toHaveCount(0);
  await expect(page.locator('.is-correct, .tile-mark--correct')).not.toHaveCount(0);
  await frame('answer-tile-marks');
  await page.getByRole('button', { name: '理解できた', exact: true }).click();
  await state('seg', 'selected', page.getByRole('button', { name: '理解できた', exact: true }), 'understanding-selected');
  const notes = page.getByRole('tab', { name: '解説', exact: true });
  await representative('view-tabs', notes);
  await notes.press('ArrowRight'); await expect(page.getByRole('tab', { name: '受入れ', exact: true })).toBeFocused();
  await state('view-tabs', 'selected', page.getByRole('tab', { name: '受入れ', exact: true }));
  await page.keyboard.press('Home'); await expect(notes).toBeFocused();
  await page.keyboard.press('End'); await expect(page.getByRole('tab', { name: '受入れ', exact: true })).toBeFocused();
  await notes.click();
  await changedWidths('answer-result-action', name => cta(name, '.page--test > .sticky-actions'));
  await page.getByRole('button', { name: '結果を見る', exact: true }).click(); await expect(page.getByRole('heading', { name: 'テスト結果', exact: true })).toBeVisible();

  // 3. Remaining controls: selected/manual/zero, native +/- bounds and reset.
  await open('/edit/button-question');
  await page.getByRole('button', { name: '残枚数', exact: true }).click();
  const suit = page.locator('.remaining-suits').getByRole('button', { name: '筒子', exact: true });
  await representative('remaining-suits', suit); await suit.click(); await state('remaining-suits', 'selected', suit);
  const remainingTile = page.locator('.remaining-tile').nth(1);
  await representative('remaining-tile', remainingTile); await remainingTile.click(); await state('remaining-tile', 'selected', remainingTile);
  const actions = page.locator('.remaining-control__actions');
  await disabled('btn', actions.locator('button').nth(1), 'remaining-plus-upper-disabled');
  await disabled('btn', actions.locator('button').nth(2), 'remaining-auto-disabled');
  await actions.locator('input').fill('0');
  await disabled('btn', actions.locator('button').nth(0), 'remaining-minus-zero-disabled');
  await expect(actions.locator('button').nth(2)).toBeEnabled();
  const zero = page.locator('.remaining-tile.is-empty.is-manual');
  await expect(zero).toHaveCount(1); expect(await zero.locator('.tile-face').evaluate(el => getComputedStyle(el).opacity)).toBe('0.45');
  expect(await zero.locator('.remaining-tile__count').evaluate(el => ({ opacity: getComputedStyle(el).opacity, text: el.textContent }))).toEqual({ opacity: '1', text: '0' });
  await expect(zero.locator('.remaining-tile__mark')).toBeVisible(); await expect(page.locator('.remaining-suit-count')).toHaveText('1');
  await frame('remaining-manual-zero', zero);
  await representative('remaining-reset-all', page.locator('.remaining-reset-all'));
  await page.locator('.remaining-reset-all').click(); await expect(page.locator('.remaining-tile.is-manual')).toHaveCount(0);
  await page.getByRole('button', { name: '残枚数', exact: true }).click();
  if (await page.locator('.ukeire-expand').count()) { await page.locator('.ukeire-expand').click(); await expect(page.locator('.ukeire-expand')).toHaveAttribute('aria-expanded', 'true'); }

  // 4. Filter palette, theme selection, record tabs and navigation.
  await open('/library'); await page.locator('.library-filters > summary').click();
  const paletteSuit = page.locator('.tile-palette__suits').getByRole('button', { name: '筒子', exact: true });
  await representative('palette-suits', paletteSuit); await paletteSuit.click(); await state('palette-suits', 'selected', paletteSuit);
  await page.getByRole('button', { name: '確認タグ', exact: true }).click(); await frame('library-selected-filters');
  await go('/settings');
  const dopa = page.getByRole('radio', { name: /^DOPA/ });
  await representative('theme-option', dopa); await state('theme-option', 'selected', dopa);
  await expect(dopa).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /萌え/ })).toBeEnabled();
  await expect(page.getByRole('radio', { name: /萌え/ })).toHaveAttribute('aria-checked', 'false');
  await frame('theme-selected-and-unselected'); await go('/records');
  const recordTabs = page.locator('.view-tabs button'); await recordTabs.nth(1).click();
  await state('view-tabs', 'selected', recordTabs.nth(1), 'records-selected-tab'); await frame('records-selected-tab');
  const nav = await snapshot(page.locator('.bottom-nav__item.is-active'));
  expect(nav.color).toBe('rgb(9, 11, 24)'); expect(nav.image).toContain('linear-gradient'); results.push({ name: 'active-navigation', value: nav });

  // 5. Actual attachment dialog/cancel, rotated meld and metadata-dirty material.
  await open('/problems/button-question');
  const thumbnail = page.locator('.attachment-thumbnail').first();
  await representative('attachment-thumbnail', thumbnail); await thumbnail.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '原寸で表示', exact: true }).click();
  await expect(page.getByRole('button', { name: '画面に合わせる', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await frame('attachment-viewer'); await page.keyboard.press('Escape'); await expect(thumbnail).toBeFocused();
  await page.getByRole('button', { name: '正解・解説を表示', exact: true }).click(); await page.locator('.detail-tools > summary').click();
  const duplicate = page.getByRole('button', { name: '複製', exact: true }); await duplicate.click();
  await expect(page.getByRole('dialog')).toBeVisible(); await frame('duplicate-dialog');
  await page.keyboard.press('Escape'); await expect(duplicate).toBeFocused();
  const meldSeed = structuredClone(seed); meldSeed.problems[0].concealed = hand.slice(3);
  meldSeed.problems[0].melds = [{ id: 'button-meld', type: 'chi', tiles: ['1m','2m','3m'], from: 'left', calledIndex: 0, addedIndex: null }];
  await open('/edit/button-question', meldSeed); await representative('meld-btn', page.locator('.meld-btn'));
  await expect(page.locator('.meld-btn .is-rotated img')).toHaveCount(1);
  await go('/materials/button-material'); await page.locator('.material-edit > summary').click();
  await page.getByRole('textbox', { name: 'タイトル', exact: true }).fill('合成教材・未保存');
  await disabled('btn', page.getByRole('button', { name: '学習した', exact: true }), 'material-dirty-disabled');

  // 6. Real ImportPage with only recognition results stubbed in this isolated CI context.
  await open('/import', seed, { importFixture: true });
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-tile.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.read-cell')).toHaveCount(3);
  expect(importStubRequests, 'CI recognition module was actually intercepted').toBeGreaterThan(0);
  const read = page.locator('.read-cell').first(); await representative('read-cell', read);
  expect((await snapshot(read)).background).toBe('rgb(255, 255, 255)');
  await expect(page.locator('.read-cell.is-unsure .read-cell__q')).toHaveText('?');
  await read.click(); await state('read-cell', 'selected', read); await expect(read).toHaveClass(/is-active/);
  await frame('import-read-cells', page.locator('.read-panel'));
  await changedWidths('import-action', name => cta(name, '.page--import > .sticky-actions'));
  await page.locator('.read-cell.is-unsure').click();
  await page.locator('.tile-palette').getByRole('button', { name: '二萬', exact: true }).click();
  await expect(page.locator('.read-cell.is-unsure')).toHaveCount(0);
  results.push({ name: 'import-fixture-scope', result: 'real review/correction UI rendered', ocrAccuracy: 'not_tested: autoRead module stubbed only in this CI browser context' });

  // PR21 made Moe available after this DOPA audit was prepared. Check theme isolation.
  await open('/settings');
  await page.getByRole('radio', { name: /^萌え/ }).click();
  await go('/');
  const moeUndo = page.getByRole('button', { name: '戻す', exact: true });
  await expect(moeUndo).toBeDisabled();
  const moeDisabled = await snapshot(moeUndo);
  expect(moeDisabled.opacity).toBe('0.65');
  expect(moeDisabled.cursor).toBe('not-allowed');
  await frame('moe-disabled-isolation-375', moeUndo);
  await go('/test');
  const moeCta = page.locator('.test-start-actions');
  const moePaint = await moeCta.evaluate(el => ({ image: getComputedStyle(el).backgroundImage, color: getComputedStyle(el).backgroundColor }));
  expect(moePaint.image).toContain('linear-gradient');
  await frame('moe-test-start-isolation-375', moeCta);
  results.push({ name: 'moe-isolation', disabled: moeDisabled, cta: moePaint });

  for (const [family, states] of Object.entries(coverage)) {
    for (const [stateName, value] of Object.entries(states)) expect(value, `${family}/${stateName} coverage`).not.toBe('not_run');
  }
  expect(errors).toEqual([]);
  await writeFile(`${out}results.json`, JSON.stringify({ status: 'automated_pass', visualReview: 'pending', revision,
    seed: 'synthetic button-question x2, one tag, local bundled tile attachment, one example.com material',
    coverage, results, errors, externalRequests, limitations: [
      'Focus screenshots require human inspection of all four edges; computed outline does not prove no clipping.',
      'Common CSS representatives are covered, not every error/restore branch or every control instance.',
      'The share-receive route is not exercised; its common .btn styling is represented by other screens.',
      'Import exercises the real review/correction UI with a CI-only autoRead stub; OCR accuracy is not tested.',
      'Widths use desktop Chromium; touch-device hover behavior is not tested.',
    ] }, null, 2));
  console.log(JSON.stringify({ status: 'automated_pass', families: Object.keys(coverage).length, records: results.length, visualReview: 'pending' }));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${out}failure.png`, animations: 'disabled' }).catch(() => {});
  await writeFile(`${out}results.json`, JSON.stringify({ status: 'fail', revision, message: String(error), coverage, results, errors, externalRequests }, null, 2));
  throw error;
} finally {
  await Promise.all(contexts.map(context => context.close())); await browser.close();
}
