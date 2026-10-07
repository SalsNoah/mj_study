// The built app, isolated synthetic profiles, and loopback requests only.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const out = new URL('../evidence/editor-defaults/', import.meta.url).pathname;
const origin = new URL(process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5179').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) {
  throw new Error('Editor defaults QA requires a loopback preview server.');
}
await mkdir(out, { recursive: true });
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const hand = ['1m','2m','3m','1p','2p','3p','1s','2s','3s','4s','0s','5s','7z','7z'];
const labels = ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','赤五索','五索','中','中'];
const when = '2026-10-06T00:00:00.000Z';
const problem = { title: '既存の正解なし', concealed: hand, drawn: null, melds: [], doraIndicators: ['4z'],
  answerEnabled: false, acceptedDiscards: [], explanation: '合成の説明', privateMemo: '', tagIds: [],
  context: { roundWind: '1z', handNumber: 1, seatWind: '1z', turn: 6, honba: 0, riichiSticks: 0,
    ownRank: null, scores: { east: 25000, south: 25000, west: 25000, north: 25000 } },
  attachments: [], sourceUrl: '', createdAt: when, updatedAt: when };
const seed = { schemaVersion: 1, revision: 0, problems: [
  { ...problem, id: 'old-off' },
  { ...problem, id: 'old-test-off', title: '既存の出題オフ', answerEnabled: true, acceptedDiscards: ['7z'] },
], study: ['old-off', 'old-test-off'].map(problemId => ({ problemId, contentRevision: 0,
  confirmationCount: 0, lastConfirmedAt: null, understanding: 'unrated', lastReviewedAt: null, inTest: false })),
  tags: [], attempts: [], settings: { autoSort: true }, daily: {} };
const results = [], errors = [], blockedRequests = [], creatorLinkRequests = [];
const browser = await chromium.launch({ headless: true });
let page;
const notes = () => page.locator('.editor-notes');
const answer = () => page.getByRole('checkbox', { name: '正解を設定する', exact: true });
// Label lookup includes hidden controls, so count=0 checks actual removal as well as visibility.
const inTest = () => page.getByLabel('テストに出題する', { exact: true });
const readStore = () => page.evaluate(() => JSON.parse(localStorage.getItem('mahjong-study:v1')));
async function nav(label) { await page.getByRole('link', { name: label, exact: true }).click(); }
async function capture(name, selector) {
  if (selector) await page.locator(selector).first().evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth,
    rootFont: getComputedStyle(document.documentElement).fontSize }));
  expect(geometry.documentWidth, `${name}: horizontal overflow`).toBeLessThanOrEqual(geometry.width);
  await page.screenshot({ path: `${out}${name}.png`, animations: 'disabled' });
  results.push({ name, status: 'pass', ...geometry });
}
async function saveToDetail(title) {
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
async function editNamed(title) {
  await nav('学習帳');
  await page.locator('.problem-card').filter({ hasText: title }).click();
  await page.getByRole('link', { name: '編集', exact: true }).click();
  await expect(notes()).toHaveJSProperty('open', true);
}

try {
  for (const width of [320, 375, 390, 1440]) for (const scale of [100, 150]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, serviceWorkers: 'block' });
    await context.addInitScript(data => {
      if (!localStorage.getItem('mahjong-study:v1')) localStorage.setItem('mahjong-study:v1', JSON.stringify(data));
    }, seed);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.href === 'https://x.com/Sals_mj') {
        creatorLinkRequests.push(url.href); return route.abort();
      }
      blockedRequests.push(url.href); return route.abort();
    });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await expect(page.getByRole('heading', { name: '問題を作成', exact: true })).toBeVisible();
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${scale}%`; }, scale);
    const suffix = `${width}-text${scale}`;
    const before = await readStore();
    await expect(notes()).toHaveJSProperty('open', true);
    await expect(answer()).toBeChecked(); await expect(inTest()).toBeChecked();
    await page.getByLabel('タイトル（任意）', { exact: true }).fill('新規の既定値確認');
    for (const name of labels) await page.locator('.tile-palette').getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.hand-stage--pick .is-correct')).toHaveCount(0);
    const indentation = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('.editor-notes label')];
      const left = text => labels.find(label => label.textContent.trim() === text).getBoundingClientRect().left;
      return { parent: left('正解を設定する'), child: left('テストに出題する') };
    });
    expect(indentation.child).toBeGreaterThan(indentation.parent);
    await capture(`defaults-on-${suffix}`, '.editor-notes > summary');

    // Exercise the native disclosure and tab order, then ensure validation reopens it.
    const summary = page.locator('.editor-notes > summary');
    await summary.focus(); await page.keyboard.press('Tab'); await expect(answer()).toBeFocused();
    await page.keyboard.press('Tab'); await expect(inTest()).toBeFocused();
    await page.keyboard.press('Space'); await expect(inTest()).not.toBeChecked();
    await answer().focus(); await page.keyboard.press('Space');
    await expect(inTest()).toHaveCount(0); await expect(answer()).toBeFocused();
    await page.keyboard.press('Space'); await expect(inTest()).not.toBeChecked();
    await capture(`child-choice-retained-${suffix}`, '.editor-notes > summary');
    await answer().press('Tab'); await expect(inTest()).toBeFocused();
    await page.keyboard.press('Space'); await expect(inTest()).toBeChecked();
    await answer().focus(); await page.keyboard.press('Space'); await expect(inTest()).toHaveCount(0);
    await page.keyboard.press('Space'); await expect(inTest()).toBeChecked();
    await summary.press('Enter'); await expect(notes()).toHaveJSProperty('open', false);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(notes()).toHaveJSProperty('open', true);
    await expect(page.getByRole('alert')).toContainText('正解設定ONのときは正解牌を1枚以上選んでください');
    await expect(page.locator('.hand-stage--pick .is-correct')).toHaveCount(0);
    expect(await readStore()).toEqual(before);
    await capture(`answer-required-${suffix}`, '[role="alert"]');

    await answer().uncheck(); await expect(inTest()).toHaveCount(0);
    await expect(page.locator('.hand-stage--pick')).toHaveCount(0);
    await capture(`parent-off-${suffix}`, '.editor-notes > summary');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('heading', { name: '学習帳', exact: true })).toBeVisible();
    const offStore = await readStore();
    const added = offStore.problems.find(item => item.title === '新規の既定値確認');
    expect(added.answerEnabled).toBe(false); expect(added.acceptedDiscards).toEqual([]);
    expect(offStore.study.find(item => item.problemId === added.id).inTest).toBe(true);
    await nav('テスト'); await expect(page.locator('.count-pill')).toContainText('0 問');
    await expect(page.getByRole('button', { name: '条件に合う問題がありません', exact: true })).toBeDisabled();
    await capture(`answerless-excluded-${suffix}`, '.test-start-actions');

    await editNamed('既存の正解なし'); await expect(answer()).not.toBeChecked();
    await expect(inTest()).toHaveCount(0);
    await answer().check(); await expect(inTest()).not.toBeChecked();
    await answer().uncheck(); await expect(inTest()).toHaveCount(0);
    await capture(`legacy-answer-off-${suffix}`, '.editor-notes > summary');
    await saveToDetail('既存の正解なし');
    let saved = await readStore();
    expect(saved.problems.find(item => item.id === 'old-off')).toMatchObject({ answerEnabled: false, acceptedDiscards: [] });
    expect(saved.study.find(item => item.problemId === 'old-off').inTest).toBe(false);
    await editNamed('既存の出題オフ'); await expect(answer()).toBeChecked(); await expect(inTest()).not.toBeChecked();
    await capture(`legacy-test-off-${suffix}`, '.editor-notes > summary');
    await saveToDetail('既存の出題オフ');
    saved = await readStore();
    expect(saved.problems.find(item => item.id === 'old-test-off').acceptedDiscards).toEqual(['7z']);
    expect(saved.study.find(item => item.problemId === 'old-test-off').inTest).toBe(false);

    await editNamed('新規の既定値確認'); await expect(answer()).not.toBeChecked();
    await answer().check(); await expect(inTest()).toBeChecked();
    await page.locator('.hand-stage--pick').getByRole('button', { name: '中', exact: true }).first().click();
    await saveToDetail('新規の既定値確認');
    saved = await readStore();
    expect(saved.problems.find(item => item.id === added.id)).toMatchObject({ answerEnabled: true, acceptedDiscards: ['7z'] });
    await nav('テスト'); await expect(page.locator('.count-pill')).toContainText('1 問');
    await page.getByRole('button', { name: '1 問でテスト開始', exact: true }).click();
    await expect(page.locator('.test-title')).toHaveText('新規の既定値確認');
    await capture(`selected-answer-eligible-${suffix}`, '.test-title');

    await nav('設定');
    const link = page.getByRole('link', { name: '製作者のX（新しいタブで開く）', exact: true });
    await expect(link).toHaveAttribute('href', 'https://x.com/Sals_mj');
    await expect(link).toHaveAttribute('target', '_blank');
    expect(await link.evaluate(el => el.relList.contains('noopener') && el.relList.contains('noreferrer'))).toBe(true);
    await link.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await capture(`creator-link-${suffix}`, 'a[href="https://x.com/Sals_mj"]');
    const previousLinkRequests = creatorLinkRequests.length;
    const [externalPage] = await Promise.all([context.waitForEvent('page'), link.press('Enter')]);
    await expect.poll(() => creatorLinkRequests.length).toBe(previousLinkRequests + 1);
    await externalPage.close();
    expect(new URL(page.url()).hash).toBe('#/settings');
    results.push({ name: `creator-link-keyboard-${suffix}`, requestedUrl: creatorLinkRequests.at(-1), transmission: 'blocked before external request', status: 'pass' });
    await page.getByRole('tab', { name: 'データ管理', exact: true }).click();
    await expect(link).toBeVisible();
    expect(await readStore()).toEqual(saved);
    await context.close();
  }
  expect(errors).toEqual([]); expect(blockedRequests).toEqual([]);
  await writeFile(`${out}results.json`, JSON.stringify({ status: 'pass', revision, results, errors, blockedRequests, creatorLinkRequests }, null, 2));
  console.log(JSON.stringify({ status: 'pass', revision, captures: results.length }));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${out}failure.png`, animations: 'disabled' });
  await writeFile(`${out}results.json`, JSON.stringify({ status: 'fail', revision, message: String(error), results, errors, blockedRequests }, null, 2));
  throw error;
} finally { await browser.close(); }
