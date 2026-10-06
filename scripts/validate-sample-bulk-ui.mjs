// Fresh isolated browser contexts; only bundled/synthetic data and the selected app origin.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Synthetic QA requires loopback');
const evidence = process.env.MAHJONG_TEST_EVIDENCE ?? new URL('../evidence/sample-bulk/', import.meta.url).pathname;
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const revision = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim() };
let currentPage;
try {
  for (const theme of ['normal', 'moe']) for (const {width, scale} of [320,375,390,1440].map(width=>({width,scale:100})).concat([{width:320,scale:150},{width:390,scale:150}])) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, serviceWorkers: 'block' });
    try {
      await context.addInitScript((value) => localStorage.setItem('mahjong-study:theme', value), theme);
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === new URL(origin).origin || url.protocol === 'data:') await route.continue();
        else await route.abort();
      });
      const page = await context.newPage();
      currentPage = page;
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/#/library`);
      await page.evaluate(scale => { document.documentElement.style.fontSize = `${scale}%`; }, scale);
      const button = (name) => page.getByRole('button', { name, exact: true });
      const raw = () => page.evaluate(() => localStorage.getItem('mahjong-study:v1'));
      await button('サンプル管理').click();
      await button('サンプル10題を追加').click();
      const before = await raw();
      const original = JSON.parse(before);
      expect(original.problems.filter((problem) => problem.answerEnabled)).toHaveLength(8);
      await button('サンプル10題を一括削除').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog').locator('li')).toHaveCount(10);
      await expect(button('キャンセル')).toBeFocused();
      expect(await page.getByRole('dialog').locator('li').allTextContents()).toEqual(original.problems.map(({ title }) => title));
      await expect(page.getByRole('dialog').getByRole('heading')).toBeInViewport();
      await expect(button('キャンセル')).toBeInViewport();
      await expect(button('10題を削除する')).toBeInViewport();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${evidence}/${theme}-${width}-text${scale}-confirm-initial.png`, animations: 'disabled' });
      await page.locator('.duplicate-confirmation__content').evaluate(element => { element.scrollTop = 0; });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${evidence}/${theme}-${width}-text${scale}-confirm-top.png`, animations: 'disabled' });
      const content = page.getByRole('dialog').getByRole('region');
      await page.keyboard.press('Shift+Tab');
      await expect(content).toBeFocused();
      await content.press('End');
      await expect(page.getByRole('dialog').locator('li').last()).toBeInViewport();
      await content.press('Home');
      await expect(page.getByRole('dialog').locator('li').first()).toBeInViewport();
      await content.press('Tab');
      await expect(button('キャンセル')).toBeFocused();
      for (const target of [page.getByRole('dialog').locator('li').first(), page.getByRole('dialog').locator('li').last(), button('キャンセル'), button('10題を削除する')]) {
        await target.scrollIntoViewIfNeeded();
        await expect(target).toBeInViewport();
      }
      await button('10題を削除する').scrollIntoViewIfNeeded();
      const geometry = await page.getByRole('dialog').evaluate((element) => ({
        documentWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        controls: [...element.querySelectorAll('button')].map((control) => ({
          text: control.textContent, height: control.getBoundingClientRect().height,
        })),
      }));
      expect(geometry.documentWidth).toBeLessThanOrEqual(width);
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(width);
      for (const control of geometry.controls) expect(control.height).toBeGreaterThanOrEqual(44);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${evidence}/${theme}-${width}-text${scale}-confirm.png`, animations: 'disabled' });
      await button('キャンセル').click();
      expect(await raw()).toBe(before);
      await expect(button('サンプル10題を一括削除')).toBeFocused();
      await button('サンプル10題を一括削除').click();
      await page.keyboard.press('Escape');
      expect(await raw()).toBe(before);
      await expect(button('サンプル10題を一括削除')).toBeFocused();
      await button('サンプル10題を一括削除').click();
      await page.locator('.duplicate-confirmation-backdrop').click({ position: { x: 1, y: 1 } });
      expect(await raw()).toBe(before);
      await expect(button('サンプル10題を一括削除')).toBeFocused();
      await button('サンプル10題を一括削除').click();
      await button('10題を削除する').click();
      await expect(page.locator('.problem-card')).toHaveCount(0);
      await expect(page.getByText('サンプルを一括削除しました。学習履歴と教材の記録は残しています。', { exact: true })).toBeFocused();
      await page.screenshot({ path: `${evidence}/${theme}-${width}-text${scale}-removed.png`, animations: 'disabled' });
      const removed = JSON.parse(await raw());
      expect(removed.study).toEqual(original.study);
      expect(removed.attempts).toEqual(original.attempts);
      expect(removed.daily).toEqual(original.daily);
      await button('サンプル10題を追加').click();
      await expect(page.locator('.problem-card')).toHaveCount(10);
      await page.locator('.sample-backups > summary').click();
      const deletionBackup = () => page.locator('.sample-backup').filter({ hasText: '10題を削除・0題を追加' });
      await deletionBackup().getByRole('button', { name: '更新前の問題を復元', exact: true }).click();
      const restored = JSON.parse(await raw());
      expect(restored.problems).toEqual(original.problems);
      expect(restored.study).toEqual(original.study);
      await page.screenshot({ path: `${evidence}/${theme}-${width}-text${scale}-restored.png`, animations: 'disabled' });
      await page.getByRole('link', { name: '設定', exact: true }).click();
      await page.getByRole('tab', { name: 'データ管理', exact: true }).click();
      await page.locator('.sample-catalog > summary').click();
      await expect(button('この10題は追加済み')).toBeDisabled();
      await button('サンプル10題を一括削除').click();
      await button('10題を削除する').click();
      expect(JSON.parse(await raw()).problems).toHaveLength(0);
      await page.locator('.sample-backups > summary').click();
      await deletionBackup().getByRole('button', { name: '更新前の問題を復元', exact: true }).click();
      expect(JSON.parse(await raw()).problems).toEqual(original.problems);
      await page.reload();
      expect(JSON.parse(await raw()).problems).toEqual(original.problems);
      expect(errors).toEqual([]);
      results.push({ theme, width, scale, geometry, problemsAfterRestore: restored.problems.length, pageErrors: errors });
    } catch (error) {
      if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({path:`${evidence}/${theme}-${width}-text${scale}-failure.png`,animations:'disabled'}).catch(()=>{});
      throw error;
    } finally {
      await context.close();
    }
  }
  await writeFile(`${evidence}/results.json`, JSON.stringify({status:'pass',revision,results}, null, 2));
  console.log(JSON.stringify({ passed: results.length, evidence }));
} catch (error) {
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({path:`${evidence}/failure.png`,animations:'disabled'}).catch(()=>{});
  await writeFile(`${evidence}/results.json`, JSON.stringify({status:'fail',revision,results,message:String(error)},null,2));
  throw error;
} finally {
  await browser.close();
}
