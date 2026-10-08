// Isolated synthetic browser data; never reads a user profile.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { openEditorNotes } from './editor-ui-helpers.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const legacy = JSON.parse(await readFile(new URL('../src/test/fixtures/legacy-problem-share.json', import.meta.url), 'utf8'));
const out = new URL('../evidence/dora/', import.meta.url).pathname;
await mkdir(out, {recursive:true});
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176';
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===origin||url.protocol==='data:'?route.continue():route.abort();});
const page=await context.newPage();const results=[];const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const sizes=[320,375,390,1280,1440,1920];
async function capture(name,expected){
 for(const width of sizes){
  await page.setViewportSize({width,height:width>=1100?900:844});
  await page.locator('.wanpai').scrollIntoViewIfNeeded();
  const actual=await page.locator('.wanpai').evaluate(el=>({
   order:[...el.children].map(x=>x.classList.contains('is-back')?'back':x.getAttribute('aria-label')),
   rects:[...el.children].map(x=>{const r=x.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}),
   overflow:document.documentElement.scrollWidth>innerWidth,
  }));
  expect(actual.order).toEqual([...expected,...Array(5-expected.length).fill('back')]);
  expect(actual.overflow).toBe(false);
  for(let i=1;i<5;i++){expect(actual.rects[i].top).toBe(actual.rects[0].top);expect(actual.rects[i].left).toBeGreaterThanOrEqual(actual.rects[i-1].right-1);}
  await page.screenshot({path:`${out}${name}-${width}.png`,animations:'disabled'});results.push({name,width,...actual});
 }
}
try{
 await page.goto(origin);await page.getByRole('heading',{name:'問題を作成',exact:true}).waitFor();
 await capture('editor-one',['北']);
 await page.locator('.wanpai').getByRole('button',{name:'北',exact:true}).click();await capture('editor-zero',[]);
 await page.getByRole('tab',{name:'ドラ表示牌',exact:true}).click();
 for(const name of ['北','一萬','赤五筒','中','北'])await page.locator('.tile-palette').getByRole('button',{name,exact:true}).click();
 await capture('editor-five',['北','一萬','赤五筒','中','北']);
 expect(await page.locator('.tile-palette button').evaluateAll(els=>els.every(el=>el.disabled))).toBe(true);
 await page.locator('.wanpai').getByRole('button',{name:'一萬',exact:true}).click();await capture('editor-remove-middle',['北','赤五筒','中','北']);
 await page.getByRole('button',{name:'戻す',exact:true}).click();
 await page.getByRole('tab',{name:'手牌',exact:true}).click();
 for(const name of ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','五索','六索','白','白'])await page.locator('.tile-palette').getByRole('button',{name,exact:true}).click();
 await openEditorNotes(page);await page.getByLabel('正解を設定する',{exact:true}).check();await page.locator('.hand-stage--pick').getByRole('button',{name:'白',exact:true}).first().click();
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.getByRole('heading',{name:'学習帳',exact:true})).toBeVisible();
 await page.locator('.problem-card').click();await page.getByRole('heading',{name:'無題の問題',exact:true}).waitFor();
 await capture('detail-five',['北','一萬','赤五筒','中','北']);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')));
 expect(saved.problems[0].doraIndicators).toEqual(['4z','1m','0p','7z','4z']);
 await expect(page.locator('.detail-tools > summary')).toHaveText('その他');
 await page.locator('.detail-tools > summary').click();
 await expect(page.getByRole('button',{name:'共有URLを生成',exact:true})).toHaveCount(0);
 await expect(page.locator('.share-box,.detail-tools textarea,.detail-tools .check-grid')).toHaveCount(0);
 const savedRaw=await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'));
 await page.getByRole('link',{name:'テスト',exact:true}).click();await page.getByRole('button',{name:'1 問でテスト開始',exact:true}).click();
 await capture('test-five',['北','一萬','赤五筒','中','北']);
 // The historical preview route is inert; the existing five-dora problem remains usable.
 await page.goto(`${origin}/${legacy.hash}`);
 await expect(page.getByRole('heading',{name:'問題共有は終了しました',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'自分の学習帳に追加',exact:true})).toHaveCount(0);
 await expect(page.locator('.wanpai,.hand-stage')).toHaveCount(0);
 await expect(page.locator('body')).not.toContainText(legacy.title);
 for(const width of sizes){
  await page.setViewportSize({width,height:width>=1100?900:844});
  const geometry=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth}));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width);
  await page.screenshot({path:`${out}retired-share-${width}.png`,animations:'disabled'});
  results.push({name:'retired-share',width,...geometry});
 }
 expect(await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'))).toBe(savedRaw);
 await page.reload();await expect(page.getByRole('heading',{name:'問題共有は終了しました',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'学習帳へ戻る',exact:true}).click();
 await expect(page.getByRole('heading',{name:'学習帳',exact:true})).toBeVisible();
 await page.goto(`${origin}/#/problems/${saved.problems[0].id}`);
 await page.getByRole('heading',{name:'無題の問題',exact:true}).waitFor();
 await capture('detail-five-after-retired-url',['北','一萬','赤五筒','中','北']);
 expect(await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'))).toBe(savedRaw);
 expect(errors).toEqual([]);await writeFile(`${out}dora-results.json`,JSON.stringify({status:'pass',legacyRouteScope:'frozen valid URL through actual App router; retired notice, no preview/import, five-slot detail preserved',results,errors},null,2));
}catch(error){await page.screenshot({path:`${out}failure.png`,animations:'disabled'});await writeFile(`${out}dora-results.json`,JSON.stringify({status:'fail',message:String(error),results,errors},null,2));throw error;}finally{await browser.close();}
