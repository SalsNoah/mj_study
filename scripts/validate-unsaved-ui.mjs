// Actual built app in isolated synthetic profiles. No external data or writes.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const out = new URL('../evidence/unsaved-ui/', import.meta.url).pathname;
const app = new URL(process.env.MAHJONG_UNSAVED_APP_URL ?? 'http://127.0.0.1:5180/mj_study/');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(app.hostname)) throw new Error('Loopback fixture required');
const revision = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim() };
await mkdir(out, { recursive: true });
const when = '2026-10-06T00:00:00Z';
const problem = { id: 'qa-editor', title: '未保存保護の確認', concealed: ['1m','2m','3m','1p','2p','3p','1s','2s','3s','4s','0s','5s','7z','7z'], drawn: null, melds: [], doraIndicators: ['4z'], answerEnabled: true, acceptedDiscards: ['7z'], explanation: '合成の解説', privateMemo: '', tagIds: [], context: { roundWind: '1z', handNumber: 1, seatWind: '1z', turn: 6, honba: 0, riichiSticks: 0, ownRank: null, scores: { east: 25000, south: 25000, west: 25000, north: 25000 } }, attachments: [], sourceUrl: '', createdAt: when, updatedAt: when };
const material = { id: 'qa-material', title: '合成の教材', url: 'https://example.com/lesson', comment: '保存済みのコメント', createdAt: when, updatedAt: when };
const seed = { schemaVersion: 1, revision: 0, problems: [problem], tags: [], study: [{ problemId: problem.id, contentRevision: 0, confirmationCount: 0, lastConfirmedAt: null, understanding: 'unrated', lastReviewedAt: null, inTest: true }], attempts: [], settings: { autoSort: true }, daily: {}, materials: [material], materialStudyEvents: [] };
const results = [], errors = [], contexts = [], network = [];
const browser = await chromium.launch({ headless: true });
let page;
async function open(theme = 'normal', width = 390, scale = 100, route = '/library') {
  const context = await browser.newContext({ viewport: { width, height: width > 1000 ? 900 : 844 }, serviceWorkers: 'block' }); contexts.push(context);
  await context.addInitScript(({ data, theme }) => { if (!localStorage.getItem('mahjong-study:v1')) localStorage.setItem('mahjong-study:v1', JSON.stringify(data)); localStorage.setItem('mahjong-study:theme', theme); }, { data: structuredClone(seed), theme });
  await context.route('**/*', route => { if (new URL(route.request().url()).origin === app.origin) return route.continue(); network.push(route.request().url()); return route.abort(); });
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${app.href}#${route}`); await page.evaluate(scale => { document.documentElement.style.fontSize = `${scale}%`; }, scale);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  return context;
}
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('mahjong-study:v1')));
const dialog = () => page.getByRole('dialog', { name: '変更を保存しますか？', exact: true });
const title = () => page.getByLabel('タイトル（任意）', { exact: true });
const nav = name => page.getByRole('link', { name, exact: true }).click();
async function edit() { await page.locator('.problem-card').first().click(); await page.getByRole('link', { name: '編集', exact: true }).click(); }
async function stay() { await dialog().getByRole('button', { name: 'この画面に残る', exact: true }).click(); await expect(dialog()).toHaveCount(0); }
async function discard() { await dialog().getByRole('button', { name: '保存せずに移動', exact: true }).click(); await expect(dialog()).toHaveCount(0); }
async function saveLeave() { await dialog().getByRole('button', { name: '保存して移動', exact: true }).click(); }
async function capture(name) {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await dialog().evaluate(el => {
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    return { viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth, dialog: rect(el), buttons: [...el.querySelectorAll('button')].map(button => ({ label: button.textContent, ...rect(button), hit: button.contains(document.elementFromPoint(button.getBoundingClientRect().x + button.getBoundingClientRect().width / 2, button.getBoundingClientRect().y + button.getBoundingClientRect().height / 2)) })) };
  });
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport.width);
  for (const button of geometry.buttons) { expect(button.x).toBeGreaterThanOrEqual(0); expect(button.right).toBeLessThanOrEqual(geometry.viewport.width); expect(button.y).toBeGreaterThanOrEqual(0); expect(button.bottom).toBeLessThanOrEqual(geometry.viewport.height); expect(button.width).toBeGreaterThanOrEqual(44); expect(button.height).toBeGreaterThanOrEqual(44); expect(button.hit).toBe(true); }
  await page.screenshot({ path: `${out}${name}.png`, animations: 'disabled' }); results.push({ name, status: 'pass', ...geometry });
}
try {
  await open(); const original = await data(); await edit();
  const accepted = page.locator('.hand-stage--pick').getByRole('button', { name: '中', exact: true });
  await expect(accepted).toHaveCount(2); for (const button of await accepted.all()) await expect(button).toHaveAttribute('aria-pressed', 'true');
  await accepted.first().click(); for (const button of await accepted.all()) await expect(button).toHaveAttribute('aria-pressed', 'false');
  await accepted.first().click(); for (const button of await accepted.all()) await expect(button).toHaveAttribute('aria-pressed', 'true');
  await nav('学習帳'); await expect(dialog()).toHaveCount(0); // Reverting to original is clean.
  await edit(); await title().fill('保存前の編集'); await nav('学習帳');
  await expect(dialog()).toBeVisible(); await expect(dialog().getByRole('button', { name: 'この画面に残る', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(title()).toHaveValue('保存前の編集'); await expect(page.getByRole('link', { name: '学習帳', exact: true })).toBeFocused(); expect(await data()).toEqual(original);
  await nav('学習帳'); await stay(); await expect(title()).toHaveValue('保存前の編集');
  await nav('学習帳'); await discard(); await expect(page.getByRole('heading', { name: '学習帳', exact: true })).toBeVisible(); expect(await data()).toEqual(original);
  await edit(); await title().fill('保存して移動した問題'); await nav('学習帳'); await saveLeave();
  await expect(page.getByRole('heading', { name: '学習帳', exact: true })).toBeVisible(); await expect(dialog()).toHaveCount(0);
  let saved = await data(); expect(saved.problems[0].title).toBe('保存して移動した問題'); expect(saved.attempts).toEqual(original.attempts); expect(saved.daily).toEqual(original.daily);
  await edit(); await title().fill('保存して移動した問題'); await nav('学習帳'); await expect(dialog()).toHaveCount(0);
  await edit(); await title().fill('戻る前の下書き'); await page.evaluate(() => history.back()); await expect(dialog()).toBeVisible(); await stay(); await expect(title()).toHaveValue('戻る前の下書き');
  await page.evaluate(() => history.back()); await expect(dialog()).toBeVisible(); await discard(); await expect(page.getByRole('heading', { name: '保存して移動した問題', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '編集', exact: true }).click(); await title().fill('再読込の保護');
  let reloadDialog = null; page.once('dialog', async event => { reloadDialog = event.type(); await event.dismiss(); });
  await page.reload({ timeout: 5000 }).catch(error => { if (!String(error).includes('ERR_ABORTED') && !String(error).includes('interrupted') && !String(error).includes('Timeout')) throw error; });
  await expect.poll(() => reloadDialog).toBe('beforeunload'); await expect(title()).toHaveValue('再読込の保護');
  await nav('学習帳'); await discard();
  await edit(); await page.locator('.hand-stage--pick').getByRole('button', { name: '中', exact: true }).first().click(); await nav('学習帳'); await saveLeave();
  await expect(dialog()).toHaveCount(0); await expect(page.getByRole('alert')).toContainText('正解設定ON'); expect((await data()).problems[0].acceptedDiscards).toEqual(['7z']);
  await page.locator('.hand-stage--pick').getByRole('button', { name: '中', exact: true }).first().click(); await nav('学習教材'); await expect(dialog()).toHaveCount(0);
  await page.locator('.material-record-link').click(); await page.getByLabel('コメント', { exact: true }).fill('保存前の教材コメント'); await nav('学習帳'); await stay();
  await expect(page.getByLabel('コメント', { exact: true })).toHaveValue('保存前の教材コメント');
  await page.locator('.material-edit > summary').click(); await page.getByLabel('タイトル', { exact: true }).fill('変更後の教材'); await page.getByLabel('URL', { exact: true }).fill('https://example.com/changed');
  await nav('学習帳'); await saveLeave(); await expect(page.getByRole('heading', { name: '学習帳', exact: true })).toBeVisible();
  saved = await data(); expect(saved.materials[0]).toMatchObject({ title: '変更後の教材', url: 'https://example.com/changed', comment: '保存前の教材コメント' }); expect(saved.materialStudyEvents).toEqual([]); expect(saved.daily).toEqual(original.daily);
  results.push({ name: 'editor-material-stay-discard-save-back-reload-validation', status: 'pass', noStudyEventsOnSave: true, actualReloadPrompt: reloadDialog });

  // A real second tab updates only this isolated synthetic store. The draft must survive reload.
  await nav('学習教材'); await page.locator('.material-record-link').click();
  await page.getByLabel('コメント', { exact: true }).fill('別タブ更新でも残すコメント');
  const writer = await page.context().newPage(); await writer.goto(`${app.href}#/materials`);
  await writer.evaluate(() => { const data = JSON.parse(localStorage.getItem('mahjong-study:v1')); data.materials = []; data.revision += 1; localStorage.setItem('mahjong-study:v1', JSON.stringify(data)); });
  await expect(page.locator('.banner')).toContainText('別タブでデータが更新');
  await page.getByRole('button', { name: '再読込', exact: true }).click();
  await expect(page.getByLabel('コメント', { exact: true })).toHaveValue('別タブ更新でも残すコメント');
  await nav('学習帳'); await saveLeave(); await expect(dialog()).toHaveCount(0);
  await expect(page.getByLabel('コメント', { exact: true })).toHaveValue('別タブ更新でも残すコメント');
  expect((await data()).materials).toEqual([]); await writer.close();
  results.push({ name: 'cross-tab-material-removal-keeps-draft-after-reload', status: 'pass' });

  for (const theme of ['normal', 'cool', 'cute', 'dopa', 'moe']) for (const [width, scale] of [[390, 100], [320, 150], [1440, 100]]) {
    await open(theme, width, scale, '/edit/qa-editor'); await title().fill('変更を残したい問題'); await nav('学習帳'); await expect(dialog()).toBeVisible();
    await capture(`editor-${theme}-${width}-text${scale}`); await stay(); await expect(title()).toHaveValue('変更を残したい問題');
    await title().fill(problem.title); await nav('学習教材'); await expect(dialog()).toHaveCount(0); await page.locator('.material-record-link').click(); await page.getByLabel('コメント', { exact: true }).fill('教材を見返したときの下書き'); await nav('記録帳'); await expect(dialog()).toBeVisible();
    await capture(`material-${theme}-${width}-text${scale}`); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await expect(dialog().getByRole('button', { name: 'この画面に残る', exact: true })).toBeFocused(); await stay();
  }
  expect(errors).toEqual([]); expect(network).toEqual([]);
  await writeFile(`${out}results.json`, JSON.stringify({ status: 'pass', revision, results, errors, network }, null, 2));
  console.log(JSON.stringify({ status: 'pass', revision, records: results.length }));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${out}failure.png`, animations: 'disabled' }).catch(() => {});
  await writeFile(`${out}results.json`, JSON.stringify({ status: 'fail', revision, message: String(error), results, errors, network }, null, 2)); throw error;
} finally { await Promise.all(contexts.map(context => context.close())); await browser.close(); }
