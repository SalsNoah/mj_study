// Built app at a subpath, isolated synthetic profiles, no user or external data.
// Keep the historical filename so existing CI consumers continue to run this check.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { openEditorNotes } from './editor-ui-helpers.mjs';

const out = new URL('../evidence/share-import/', import.meta.url).pathname;
const app = new URL(process.env.MAHJONG_SHARE_APP_URL ?? 'http://127.0.0.1:5178/mj_study/');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(app.hostname)) throw new Error('Synthetic test requires loopback');
// A frozen URL from the removed encoder: do not recreate a sharing implementation in QA.
const legacy = JSON.parse(await readFile(new URL('../src/test/fixtures/legacy-problem-share.json', import.meta.url), 'utf8'));
expect(legacy.hash).toMatch(/^#share=v1\./);
expect(legacy.title).toBeTruthy();
await mkdir(out, { recursive: true });
const results = [], errors = [], contexts = [];
const revision = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim() };
const when = '2026-10-06T00:00:00Z';
const problem = {
  id: 'existing-custom', title: '保存済みの自作問題',
  concealed: ['1m','2m','3m','1p','2p','3p','1s','2s','3s','4s','0s','5s','7z','7z'],
  drawn: null, melds: [], doraIndicators: ['4z'], answerEnabled: true, acceptedDiscards: ['7z'],
  explanation: '保存済みの解説', privateMemo: '保存済みの合成メモ', tagIds: ['custom-tag'],
  context: { roundWind: '1z', handNumber: 1, seatWind: '1z', turn: 6, honba: 0, riichiSticks: 0, ownRank: null, scores: { east: 25000, south: 25000, west: 25000, north: 25000 } },
  attachments: [], sourceUrl: '', createdAt: when, updatedAt: when,
};
const imported = { ...problem, id: 'existing-imported', title: '以前の共有で取り込んだ問題', privateMemo: '取込後に追記したメモ', tagIds: ['imported-tag'] };
const seed = {
  schemaVersion: 1, revision: 7, problems: [problem, imported],
  tags: [{ id: 'custom-tag', name: '自作' }, { id: 'imported-tag', name: '取込済み' }],
  study: [problem, imported].map((entry, i) => ({ problemId: entry.id, contentRevision: i, confirmationCount: i + 2, lastConfirmedAt: when, understanding: 'understood', lastReviewedAt: when, lastSolvedAt: when, lastCorrectAt: when, inTest: true })),
  attempts: [{ id: 'existing-attempt', problemId: imported.id, contentRevision: 1, sessionId: 'existing-session', questionIndex: 0, at: when, selectedTile: '7z', result: 'correct' }],
  settings: { autoSort: true }, daily: { '2026-10-06': { tested: 1, confirmed: 5 } },
  materials: [], materialStudyEvents: [],
};
const hashes = [
  ['valid-legacy', legacy.hash],
  ['bare', '#share'],
  ['empty', '#share='],
  ['empty-body', '#share=v1.'],
  ['unknown-version', '#share=v9.abc'],
  ['malformed-percent', '#share=%E0%A4%A'],
  ['malformed-body', '#share=v1.%%%'],
  ['markup', '#share=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E'],
];
const browser = await chromium.launch({ headless: true });
let page;
async function open(width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  contexts.push(context);
  await context.addInitScript(({ seed, title }) => {
    // Seed once, so a reload cannot conceal an accidental deletion by restoring data.
    if (!sessionStorage.getItem('retired-share-fixture-ready')) {
      localStorage.setItem('mahjong-study:v1', JSON.stringify(seed));
      sessionStorage.setItem('retired-share-fixture-ready', 'yes');
    }
    window.__retiredShareActivity = [];
    const retired = () => location.hash === '#share' || location.hash.startsWith('#share=');
    const originalAtob = window.atob;
    window.atob = function (...args) {
      if (retired()) window.__retiredShareActivity.push('base64 decode');
      return originalAtob.apply(this, args);
    };
    const originalParse = JSON.parse;
    JSON.parse = function (text, ...args) {
      if (retired() && typeof text === 'string' && text.includes(title)) window.__retiredShareActivity.push('payload JSON parse');
      return originalParse.call(this, text, ...args);
    };
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        if (this === localStorage && retired() && (method === 'clear' || args[0] === 'mahjong-study:v1')) window.__retiredShareActivity.push(`store ${method}`);
        return original.apply(this, args);
      };
    }
  }, { seed, title: legacy.title });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === app.origin || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
}
const rawStore = () => page.evaluate(() => localStorage.getItem('mahjong-study:v1'));
const readStore = async () => JSON.parse(await rawStore());
async function noProblemSharing() {
  await expect(page.getByRole('button', { name: '共有URLを生成', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '自分の学習帳に追加', exact: true })).toHaveCount(0);
  await expect(page.locator('.share-box')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'URL共有', exact: true })).toHaveCount(0);
  for (const name of ['正解・解説を含める', 'タグを含める', '出典URLを含める']) await expect(page.getByLabel(name, { exact: true })).toHaveCount(0);
}
async function retiredNotice(expectedStore) {
  await expect(page.getByRole('heading', { name: '問題共有は終了しました', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '学習帳へ戻る', exact: true })).toBeVisible();
  await noProblemSharing();
  await expect(page.locator('.hand-stage,.ukeire-panel,textarea')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '共有プレビュー（読取専用）', exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(legacy.title);
  await expect(page.locator('body')).not.toContainText(legacy.payload.explanation);
  await expect(page.locator('body')).not.toContainText(legacy.payload.sourceUrl);
  await expect(page.locator('body')).not.toContainText('<img src=x onerror=alert(1)>');
  expect(await rawStore()).toBe(expectedStore);
  expect(await page.evaluate(() => window.__retiredShareActivity)).toEqual([]);
}
async function library(expectedStore) {
  await expect(page.getByRole('heading', { name: '学習帳', exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/library');
  await expect(page.getByRole('heading', { name: '問題共有は終了しました', exact: true })).toHaveCount(0);
  await expect(page.locator('.problem-card')).toHaveCount(2);
  expect(await rawStore()).toBe(expectedStore);
}
async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.locator('.hand-stage img').evaluateAll(images => images.every(i => i.complete && i.naturalWidth > 0))).toBe(true);
  const geometry = await page.evaluate(() => ({
    width: innerWidth, documentWidth: document.documentElement.scrollWidth,
    blankPanels: [...document.querySelectorAll('.panel')]
      .filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && !el.innerText.trim() && !el.querySelector('img,input,button,textarea,select,canvas'))
      .map(el => el.className),
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width);
  expect(geometry.blankPanels).toEqual([]);
  await page.screenshot({ path: `${out}${name}.png`, animations: 'disabled' });
  results.push({ name, ...geometry });
}
async function openTools() {
  const tools = page.locator('.detail-tools');
  await expect(tools.locator(':scope > summary')).toHaveText('その他');
  if (!(await tools.evaluate(el => el.open))) await tools.locator(':scope > summary').click();
  await expect(tools.getByRole('button', { name: '複製', exact: true })).toBeVisible();
  await expect(tools.getByRole('button', { name: '削除', exact: true })).toBeVisible();
  await expect(tools.locator('textarea,.check-grid,section.panel')).toHaveCount(0);
  await noProblemSharing();
}

try {
  for (const width of [320, 390]) {
    await open(width);
    const expectedStore = JSON.stringify(seed);
    for (const [name, hash] of hashes) {
      await page.goto(`${app.href}${hash}`);
      await retiredNotice(expectedStore);
      await capture(`retired-${name}-${width}`);
      if (name === 'valid-legacy' && width === 320) {
        for (const extraWidth of [375, 1440]) {
          await page.setViewportSize({ width: extraWidth, height: extraWidth > 1000 ? 900 : 844 });
          await capture(`retired-${name}-${extraWidth}`);
        }
        await page.setViewportSize({ width, height: 844 });
      }
      await page.reload();
      await retiredNotice(expectedStore);
      await page.getByRole('button', { name: '学習帳へ戻る', exact: true }).click();
      await library(expectedStore);
      await page.goBack();
      await retiredNotice(expectedStore);
      await page.goForward();
      await library(expectedStore);
      await page.reload();
      await library(expectedStore);
    }
    // Hash-only navigation must update the real App router without a page reload.
    for (const [, hash] of hashes) {
      await page.evaluate(hash => { window.location.hash = hash; }, hash);
      await retiredNotice(expectedStore);
    }
    await page.evaluate(() => document.documentElement.style.fontSize = '150%');
    await capture(`retired-text150-${width}`);
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    await page.getByRole('button', { name: '学習帳へ戻る', exact: true }).click();
    await library(expectedStore);

    // Previously imported problems remain ordinary editable problems.
    for (const entry of [problem, imported]) {
      await page.goto(`${app.href}#/problems/${entry.id}`);
      await expect(page.getByRole('heading', { name: entry.title, exact: true })).toBeVisible();
      await openTools();
      await capture(`detail-${entry.id}-${width}`);
      await page.getByRole('button', { name: '正解・解説を表示', exact: true }).click();
      await expect(page.getByText(entry.privateMemo, { exact: true })).toBeVisible();
      await page.locator('#detail-view-tab-ukeire').click();
      await expect(page.locator('.ukeire-list > li:visible')).toHaveCount(3);
      await page.getByRole('button', { name: '残枚数', exact: true }).click();
      await expect(page.locator('.remaining-panel')).toBeVisible();
      await capture(`detail-remaining-${entry.id}-${width}`);
      await page.getByRole('link', { name: '編集', exact: true }).click();
      await expect(page.getByRole('heading', { name: '問題を編集', exact: true })).toBeVisible();
      await noProblemSharing();
      await openEditorNotes(page);
      await expect(page.getByRole('textbox', { name: '自分のメモ', exact: true })).toHaveValue(entry.privateMemo);
      await capture(`editor-${entry.id}-${width}`);
      expect(await rawStore()).toBe(expectedStore);
    }
    await page.getByRole('link', { name: '作成', exact: true }).click();
    await expect(page.getByRole('heading', { name: '問題を作成', exact: true })).toBeVisible();
    await noProblemSharing();
    await capture(`editor-new-${width}`);
    results.push({ name: `legacy-routing-and-existing-data-${width}`, hashes: hashes.map(([name]) => name), reloadBackForward: 'pass', dataPreservation: 'byte-for-byte', payloadActivity: 'none' });
  }

  // Remaining detail actions retain their behavior after the sharing panel is removed.
  await page.goto(`${app.href}#/problems/${imported.id}`);
  await expect(page.getByRole('heading', { name: imported.title, exact: true })).toBeVisible();
  await openTools();
  const beforeActions = await readStore();
  await page.getByRole('button', { name: '確認した（問題一覧に戻る）', exact: true }).click();
  expect((await readStore()).study.find(entry => entry.problemId === imported.id).confirmationCount).toBe(4);
  await page.getByRole('button', { name: '取り消す', exact: true }).click();
  expect((await readStore()).study).toEqual(beforeActions.study);
  await page.locator('.problem-card').filter({hasText:imported.title}).click();
  await openTools();
  await page.getByRole('button', { name: '複製', exact: true }).click();
  await page.getByRole('dialog', { name: '問題を複製しますか？', exact: true }).getByRole('button', { name: 'キャンセル', exact: true }).click();
  expect((await readStore()).problems).toEqual(beforeActions.problems);
  await page.getByRole('button', { name: '複製', exact: true }).click();
  await page.getByRole('dialog', { name: '問題を複製しますか？', exact: true }).getByRole('button', { name: '複製する', exact: true }).click();
  await expect.poll(async () => (await readStore()).problems.length).toBe(3);
  const duplicated = (await readStore()).problems.at(-1);
  expect(duplicated.id).not.toBe(imported.id);
  expect(duplicated.privateMemo).toBe(imported.privateMemo);
  expect(new URL(page.url()).hash).toBe(`#/problems/${duplicated.id}`);
  await openTools();
  await capture('remaining-tools-after-duplicate');
  const beforeDelete = await rawStore();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '削除', exact: true }).click();
  expect(await rawStore()).toBe(beforeDelete);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '削除', exact: true }).click();
  await expect(page.getByRole('heading', { name: '学習帳', exact: true })).toBeVisible();
  const afterDelete = await readStore();
  expect(afterDelete.problems).toEqual(seed.problems);
  expect(afterDelete.study).toEqual(seed.study);
  expect(afterDelete.attempts).toEqual(seed.attempts);
  expect(afterDelete.tags).toEqual(seed.tags);

  // Record-image/X sharing and the creator's X link are separate, retained features.
  await page.getByRole('link', { name: '記録帳', exact: true }).click();
  await page.getByRole('button', { name: 'Xに記録を投稿', exact: true }).click();
  await expect(page.locator('.record-share-preview')).toBeVisible();
  await expect(page.locator('.record-share-preview')).toHaveJSProperty('naturalWidth', 1080);
  if (!(await page.locator('.record-share-fallback').evaluate(el => el.open))) await page.locator('.record-share-fallback > summary').click();
  await expect(page.getByRole('link', { name: '1. 画像を保存', exact: true })).toHaveAttribute('download', /.+/);
  await expect(page.getByRole('link', { name: '2. Xの投稿画面を開く', exact: true })).toHaveAttribute('href', /^https:\/\/twitter\.com\/intent\/tweet\?/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.record-share-dialog')).toHaveCount(0);
  await page.getByRole('link', { name: '設定', exact: true }).click();
  await expect(page.getByRole('link', { name: '製作者のX（新しいタブで開く）', exact: true })).toHaveAttribute('href', 'https://x.com/Sals_mj');
  results.push({ name: 'remaining-actions-and-record-sharing', confirmationUndo: 'pass', duplicateCancelSave: 'pass', deleteCancelSave: 'pass', recordImageAndX: 'pass', creatorX: 'pass' });
  expect(errors).toEqual([]);
  await writeFile(`${out}results.json`, JSON.stringify({ status: 'pass', scope: 'retired problem URLs through actual App routing; remaining normal tools and record sharing', revision, builtSubpath: app.pathname, results, errors }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: `${out}failure.png`, animations: 'disabled' }).catch(() => {});
  await writeFile(`${out}results.json`, JSON.stringify({ status: 'fail', revision, message: String(error), results, errors }, null, 2));
  throw error;
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
