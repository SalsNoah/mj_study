// Built app at a subpath, isolated synthetic profiles, no user or external data.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
const out = new URL('../evidence/share-import/', import.meta.url).pathname;
const app = new URL(process.env.MAHJONG_SHARE_APP_URL ?? 'http://127.0.0.1:5178/mj_study/');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(app.hostname)) throw new Error('Synthetic test requires loopback');
await mkdir(out, { recursive: true });
const results = [], errors = [], contexts = [];
const revision = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim() };
const empty = { schemaVersion: 1, revision: 0, problems: [], tags: [], study: [], attempts: [], settings: { autoSort: true }, daily: {}, materials: [], materialStudyEvents: [] };
const when = '2026-10-06T00:00:00Z';
const problem = { id: 'share-source', title: '共有の手牌を確認', concealed: ['1m','2m','3m','1p','2p','3p','1s','2s','3s','4s','0s','5s','7z','7z'], drawn: null, melds: [], doraIndicators: ['4z'], answerEnabled: true, acceptedDiscards: ['7z'], explanation: '牌姿と判断を共有します。', privateMemo: '共有しない合成メモ', tagIds: [], context: { roundWind: '1z', handNumber: 1, seatWind: '1z', turn: 6, honba: 0, riichiSticks: 0, ownRank: null, scores: { east: 25000, south: 25000, west: 25000, north: 25000 } }, attachments: [], sourceUrl: '', createdAt: when, updatedAt: when };
const browser = await chromium.launch({ headless: true });
let page;
async function open(seed = empty) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  contexts.push(context);
  await context.addInitScript(seed => { if (!localStorage.getItem('mahjong-study:v1')) localStorage.setItem('mahjong-study:v1', JSON.stringify(seed)); }, seed);
  await context.route('**/*', route => new URL(route.request().url()).origin === app.origin ? route.continue() : route.abort());
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); return page;
}
async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.locator('.hand-stage img').evaluateAll(images => images.every(i => i.complete && i.naturalWidth > 0))).toBe(true);
  const geometry = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width);
  await page.screenshot({ path: `${out}${name}.png`, animations: 'disabled' }); results.push({ name, ...geometry });
}
try {
  const sender = await open({ ...empty, problems: [problem] });
  await page.goto(`${app.href}#/problems/${problem.id}`);
  await page.getByRole('button', { name: '正解・解説を表示', exact: true }).waitFor();
  await page.locator('.detail-tools > summary').click();
  await page.getByRole('button', { name: '共有URLを生成', exact: true }).click();
  const url = await page.locator('.share-box textarea').inputValue();
  expect(new URL(url).origin).toBe(app.origin); expect(new URL(url).pathname).toBe(app.pathname);
  expect(new URL(url).hash).toMatch(/^#share=v1\./);
  await capture('sender-generated-subpath-url');
  const receiver = await open({ ...empty, problems: [{ ...problem, id: 'existing', title: '受信側にある問題' }] });
  await receiver.goto(url);
  await expect(page.getByRole('heading', { name: '共有プレビュー（読取専用）', exact: true })).toBeVisible();
  for (const width of [320, 375, 390, 1440]) {
    await page.setViewportSize({ width, height: width > 1000 ? 900 : 844 });
    await capture(`preview-${width}`);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => document.documentElement.style.fontSize = '150%'); await capture('preview-320-text150');
  await page.evaluate(() => document.documentElement.style.fontSize = '');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mahjong-study:v1')).problems.length)).toBe(1);
  await page.getByRole('button', { name: '自分の学習帳に追加', exact: true }).click();
  await expect(page.getByRole('heading', { name: problem.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '正解・解説を表示', exact: true })).toBeVisible();
  const store = await page.evaluate(() => JSON.parse(localStorage.getItem('mahjong-study:v1')));
  expect(store.problems).toHaveLength(2); expect(store.problems[0].title).toBe('受信側にある問題');
  const added = store.problems[1]; expect(added.privateMemo).toBe(''); expect(added.attachments).toEqual([]);
  expect(added.concealed).toEqual(problem.concealed); expect(added.acceptedDiscards).toEqual(problem.acceptedDiscards);
  expect(new URL(page.url()).hash).toBe(`#/problems/${added.id}`);
  await capture('saved-detail');
  await page.goBack(); await expect(page.getByRole('heading', { name: '共有プレビュー（読取専用）', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mahjong-study:v1')).problems.length)).toBe(2);
  await page.goForward(); await expect(page.getByRole('heading', { name: problem.title, exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: problem.title, exact: true })).toBeVisible();
  await page.goto(url); await expect(page.getByText('似た問題が既にあります。追加すると複製になります（上書きしません）。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '学習帳へ戻る', exact: true }).click(); await expect(page.getByRole('heading', { name: '学習帳', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mahjong-study:v1')).problems.length)).toBe(2);
  results.push({ name: 'explicit-import-preserves-existing-data', count: 2, privateMemoOmitted: true, reloadAndReturn: 'pass' });
  const valid = JSON.parse(strFromU8(inflateSync(new Uint8Array(Buffer.from(new URL(url).hash.slice('#share=v1.'.length), 'base64url')))));
  const missingContext = '#share=v1.' + Buffer.from(deflateSync(strToU8(JSON.stringify({ ...valid, context: { roundWind: '1z', seatWind: '1z' } })))).toString('base64url');
  for (const hash of ['#share=', '#share=v9.abc', '#share=%E0%A4%A', missingContext]) {
    await page.goto(`${app.href}${hash}`); await expect(page.getByRole('heading', { name: '共有の取込', exact: true })).toBeVisible();
    await expect(page.locator('.error')).toBeVisible(); await expect(page.getByRole('button', { name: '自分の学習帳に追加', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mahjong-study:v1')).problems.length)).toBe(2);
  }
  await capture('invalid-share-safe-error');
  expect(errors).toEqual([]);
  await writeFile(`${out}results.json`, JSON.stringify({ status: 'pass', revision, builtSubpath: app.pathname, results, errors }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: `${out}failure.png`, animations: 'disabled' }).catch(() => {});
  await writeFile(`${out}results.json`, JSON.stringify({ status: 'fail', revision, message: String(error), results, errors }, null, 2)); throw error;
} finally { await Promise.all(contexts.map(context => context.close())); await browser.close(); }
