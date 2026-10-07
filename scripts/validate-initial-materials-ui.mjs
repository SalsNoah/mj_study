// Isolated local profiles; all external requests are blocked and no video is opened.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const app = new URL(process.env.MAHJONG_INITIAL_APP_URL ?? 'http://127.0.0.1:5176/mj_study/');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(app.hostname)) throw new Error('Loopback required');
const out = new URL('../evidence/initial-materials/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.MAHJONG_CHROMIUM_PATH ? { executablePath: process.env.MAHJONG_CHROMIUM_PATH } : {}) });
const key = 'mahjong-study:v1';
const urls = ['https://youtu.be/apqIuvnVA9M', 'https://youtu.be/8emBEqgAFzc', 'https://youtu.be/2LjOtn6pgb8'];
const titles = ['〖麻雀講座〗上達に役立つ麻雀コンテンツ７選〖天鳳位〗', '〖麻雀講座〗5分でできる牌譜検討のやり方〖天鳳位〗', '〖麻雀講座〗座学のし過ぎで打数少ない系天鳳位の座学講座〖ヨーテル〗'];
const blocked = [], errors = [], results = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'ja-JP' });
context.setDefaultTimeout(10000);
await context.route('**/*', route => {
  const request = route.request();
  if (new URL(request.url()).origin === app.origin) return route.continue();
  blocked.push({ url: request.url(), type: request.resourceType() });
  return route.abort();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const raw = () => page.evaluate(key => localStorage.getItem(key), key);
const data = async () => JSON.parse(await raw());
const nav = name => page.getByRole('link', { name, exact: true }).click();
async function list() {
  await nav('学習教材');
  await expect(page.locator('.material-card h2')).toHaveText(titles);
  expect(await page.locator('.material-direct-link').evaluateAll(links => links.map(a => a.href))).toEqual(urls);
}
try {
  await page.goto(`${app.href}#/materials`);
  await list();
  expect(await raw()).toBeNull();
  await expect(page.locator('.material-count')).toHaveText(['学習 0 回', '学習 0 回', '学習 0 回']);
  expect(await page.locator('video,iframe').count()).toBe(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width > 1000 ? 900 : 844 });
    await page.screenshot({ path: `${out}new-user-${width}.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.material-card').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}new-user-390-bottom.png`, animations: 'disabled' });
  await page.reload(); await list(); expect(await raw()).toBeNull();
  results.push('fresh-user order / zero study / reload / no player / responsive screenshots');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.material-record-link').first().click();
  await page.getByLabel('コメント', { exact: true }).fill('初期教材への自分のメモ');
  await nav('記録帳');
  const guard = page.getByRole('dialog', { name: '変更を保存しますか？', exact: true });
  await guard.getByRole('button', { name: 'この画面に残る', exact: true }).click();
  await expect(page.getByLabel('コメント', { exact: true })).toHaveValue('初期教材への自分のメモ');
  await nav('学習教材');
  await guard.getByRole('button', { name: '保存して移動', exact: true }).click();
  await list();
  let saved = await data(); expect(saved.materials).toHaveLength(3); expect(saved.materialStudyEvents ?? []).toHaveLength(0);
  const savedBytes = await raw();
  await page.reload(); await list(); expect(await raw()).toBe(savedBytes);
  results.push('unsaved comment guard / save-and-leave without study / exact-byte reload');

  await page.getByRole('button', { name: '教材を追加', exact: true }).click();
  await page.getByLabel('URL', { exact: true }).fill(urls[0]);
  await page.getByRole('button', { name: '登録する', exact: true }).click();
  await expect(page.getByRole('link', { name: '登録済みの教材を開く', exact: true })).toBeVisible();
  expect(await raw()).toBe(savedBytes);
  await page.getByRole('link', { name: '登録済みの教材を開く', exact: true }).click();
  await page.getByRole('button', { name: '教材をアーカイブ', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'アーカイブする', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '学習中に復元する', exact: true })).toBeVisible();
  expect((await data()).materials[0].comment).toBe('初期教材への自分のメモ');
  expect((await data()).materialStudyEvents ?? []).toHaveLength(0);
  await page.getByRole('button', { name: '学習中に復元する', exact: true }).click();
  await list();
  results.push('duplicate URL refusal / archive survives reload / explicit restore');

  await nav('設定');
  await page.getByRole('tab', { name: 'データ管理', exact: true }).click();
  await page.getByText('すべてのデータを削除', { exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '全件削除', exact: true }).click();
  await page.reload(); await nav('学習教材');
  await expect(page.locator('.material-card')).toHaveCount(0);
  results.push('explicit clear of starter materials / restart never resurrects');

  // An existing old empty backup remains empty across startup; no initialization migration.
  const empty = { schemaVersion: 1, revision: 0, problems: [], tags: [], study: [], attempts: [], settings: { autoSort: true }, daily: {} };
  await nav('設定');
  await page.getByRole('tab', { name: 'データ管理', exact: true }).click();
  await page.getByRole('button', { name: 'JSON復元…', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'old-empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(empty)) });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.import-preview').getByRole('button', { name: '全置換', exact: true }).click();
  await page.reload(); await nav('学習教材');
  await expect(page.locator('.material-card')).toHaveCount(0);
  expect((await data()).materialStudyEvents ?? []).toHaveLength(0);
  await page.screenshot({ path: `${out}old-backup-empty-390.png`, fullPage: true, animations: 'disabled' });
  results.push('actual backup replace / restart remains empty');

  expect(blocked.every(request => request.type === 'image' && /^https:\/\/i\.ytimg\.com\/vi\/(apqIuvnVA9M|8emBEqgAFzc|2LjOtn6pgb8)\/mqdefault\.jpg$/.test(request.url))).toBe(true);
  expect(context.pages()).toHaveLength(1);
  expect(errors).toEqual([]);
  await writeFile(`${out}results.json`, JSON.stringify({ results, externalRequestsBlocked: blocked, pageErrors: errors, actualVideosOpened: 0 }, null, 2));
  console.log(JSON.stringify({ results, pageErrors: errors, actualVideosOpened: 0 }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${out}failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
