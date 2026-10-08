// Run against a production build under the same subpath used by GitHub Pages.
import { chromium, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { mkdirSync } from 'node:fs';
const url = process.env.MAHJONG_PRODUCTION_URL ?? 'http://127.0.0.1:5186/mj_study/ocr-check.html';
const browser = await chromium.launch({ executablePath: process.env.MAHJONG_CHROMIUM || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.addInitScript(() => {
    window.__storageCalls = [];
    for (const name of ['getItem','setItem','removeItem','clear']) {
      const original = Storage.prototype[name];
      Storage.prototype[name] = function(...args) { window.__storageCalls.push(name); return original.apply(this,args); };
    }
  });
  const response = await page.goto(url);
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading',{name:'画像認識チェック',exact:true})).toBeVisible();
  const data = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 360; return c.toDataURL().split(',')[1]; });
  await page.locator('input[type=file]').setInputFiles({ name:'synthetic-blank.png', mimeType:'image/png', buffer:Buffer.from(data,'base64') });
  await expect(page.getByRole('status')).toContainText('手牌を認識できませんでした', { timeout:30000 });
  await expect(page.getByText('正解未確定のため、まだ一致率を算出していません。',{exact:true})).toBeVisible();
  await page.getByLabel('正解の手牌',{exact:true}).fill('1m');
  await page.getByLabel('画像に副露がないことを確認しました',{exact:true}).check();
  await page.getByRole('button',{name:'正解を確定して比較',exact:true}).click();
  await expect(page.getByText('不一致（0 / 1画像）',{exact:true})).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'結果JSONを保存',exact:true}).click()]);
  const stream = await download.createReadStream(); const chunks = []; for await (const c of stream) chunks.push(c);
  const result = JSON.parse(Buffer.concat(chunks).toString());
  expect(result.model.localBank).toBe('empty'); expect(result.codeRevision).toMatch(/^[0-9a-f]{40}$/);
  if (process.env.MAHJONG_EXPECTED_REVISION) expect(result.codeRevision).toBe(process.env.MAHJONG_EXPECTED_REVISION);
  expect(await page.evaluate(() => window.__storageCalls)).toEqual([]);
  expect(requests.every(r => r.method === 'GET' && r.body === null && new URL(r.url).origin === new URL(url).origin)).toBe(true);
  expect(requests.some(r => r.url === new URL('./import-model.json?v=4',url).href)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  mkdirSync('evidence/ocr-check',{recursive:true});
  await page.screenshot({ path:'evidence/ocr-check/production-mobile.png',fullPage:true });
  console.log(JSON.stringify({url,status:response.status(),codeRevision:result.codeRevision,model:result.model,syntheticBlank:'notDetected; known truth mismatch',storageCalls:0,imageUploadRequests:0,pageErrors:errors},null,2));
} finally { await browser.close(); }
