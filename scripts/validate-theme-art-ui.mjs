// Generated local artwork and synthetic profiles only. No external content or credentials.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const out=new URL('../evidence/theme-art/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const origin=process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5176';
const browser=await chromium.launch({headless:true});
let page;
const results=[],errors=[];
const when='2026-10-05T00:00:00Z';
const hand=['1m','2m','3m','1p','2p','3p','1s','2s','3s','4s','0s','5s','7z','7z'];
const base={title:'背景の上でも牌と判断の理由を読み取る',concealed:hand,drawn:null,melds:[],doraIndicators:['4z'],answerEnabled:true,acceptedDiscards:['7z'],explanation:'解説の表示確認',privateMemo:'',tagIds:[],context:{roundWind:'1z',handNumber:1,seatWind:'1z',turn:6,honba:0,riichiSticks:0,ownRank:null,scores:{east:25000,south:25000,west:25000,north:25000}},attachments:[],sourceUrl:'https://example.com/source',createdAt:when,updatedAt:when};
const problems=[base,{...base,title:'長い題名：巡目と対局条件を確かめ、残り枚数から判断の理由を整理する'}, {...base,title:'正解を決めない学習メモ',answerEnabled:false,acceptedDiscards:[]}].map((p,i)=>({...p,id:`art-${i}`}));
const seed={schemaVersion:1,revision:0,problems,tags:[],study:problems.map(p=>({problemId:p.id,contentRevision:0,confirmationCount:0,lastConfirmedAt:null,understanding:'unrated',lastReviewedAt:null,inTest:true})),attempts:[],settings:{autoSort:true},daily:{},materials:[],materialStudyEvents:[]};
async function open(theme,empty=false,failImages=false){
 const ctx=await browser.newContext({viewport:{width:390,height:740},serviceWorkers:'block'});
 const data=empty?{...structuredClone(seed),problems:[],study:[]}:seed;
 await ctx.addInitScript(({data,theme})=>{if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(data));if(!localStorage.getItem('mahjong-study:theme'))localStorage.setItem('mahjong-study:theme',theme);},{data,theme});
 const failed=[];
 await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(failImages&&u.pathname.startsWith(`/themes/${theme}/`)){failed.push(u.pathname);return route.abort();}return u.origin===origin?route.continue():route.abort();});
 page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.locator('.page--editor').waitFor();return{ctx,failed};
}
async function nav(name){await page.getByRole('link',{name,exact:true}).click();await page.locator({'学習帳':'.page--library','学習教材':'.page--materials','テスト':'.page--test','設定':'.page--settings','作成':'.page--editor'}[name]).waitFor();}
async function capture(name){
 await page.evaluate(()=>document.fonts.ready);const cards=page.locator('.problem-card');if(await cards.count())await expect.poll(()=>cards.first().evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
 const g=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,background:getComputedStyle(document.documentElement).backgroundImage}));
 expect(g.documentWidth).toBeLessThanOrEqual(g.width);await page.screenshot({path:`${out}${name}.png`,animations:'disabled'});results.push({name,...g});
}
try{
 const manifest=JSON.parse(await readFile(new URL('../docs/theme-art-sources.json',import.meta.url),'utf8'));
 expect(manifest.assets).toHaveLength(4);
 for(const a of manifest.assets){const b=await readFile(new URL(`../${a.path}`,import.meta.url));expect(createHash('sha256').update(b).digest('hex')).toBe(a.sha256);}
 for(const theme of ['cool','cute']){
  const{ctx}=await open(theme);const initial=await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'));
  const loads=await page.evaluate(async theme=>Promise.all(['background','card'].map(name=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve({name,width:i.naturalWidth,height:i.naturalHeight});i.onerror=()=>reject(new Error('image load failed'));i.src=new URL(`themes/${theme}/${name}.webp`,location.href.split('#')[0]).href;}))),theme);
  for(const item of loads){expect(item.width).toBe(1536);expect(item.height).toBe(1024);}results.push({name:`${theme}-artwork-loaded`,loads});
  await nav('学習帳');
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:width===1440?900:740});await capture(`${theme}-library-${width}`);}
  const paint=await page.locator('.problem-card').evaluateAll(items=>items.map(el=>({image:getComputedStyle(el,'::after').backgroundImage,pointer:getComputedStyle(el,'::after').pointerEvents,animation:getComputedStyle(el,'::after').animationName})));
  for(const p of paint){expect(p.image).toContain(`/themes/${theme}/card.webp`);expect(p.pointer).toBe('none');expect(p.animation).toBe('none');}results.push({name:`${theme}-decorative-card-paint`,paint});
  await page.setViewportSize({width:320,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await capture(`${theme}-library-text150`);await page.evaluate(()=>document.documentElement.style.fontSize='');
  await page.locator('.library-filters > summary').click();await page.locator('.library-filters').getByRole('button',{name:'一萬',exact:true}).click();await expect(page.locator('.match-reason').first()).toBeVisible();
  await page.locator('.problem-card').first().scrollIntoViewIfNeeded();await capture(`${theme}-tile-search-match-320`);
  const matchColors=await page.locator('.match-reason').evaluateAll(items=>items.map(el=>getComputedStyle(el).color));const ink=await page.evaluate(()=>getComputedStyle(document.body).color);for(const color of matchColors)expect(color).toBe(ink);results.push({name:`${theme}-match-reason-contrast-color`,colors:matchColors});
  await page.locator('.problem-card').first().click();await expect(page.getByRole('button',{name:'正解・解説を表示',exact:true})).toBeVisible();await capture(`${theme}-detail-hidden-320`);
  await page.getByRole('button',{name:'正解・解説を表示',exact:true}).click();const source=page.locator('#detail-view-panel-notes > p > a');await source.scrollIntoViewIfNeeded();expect(await source.evaluate(el=>getComputedStyle(el).color)).toBe(ink);await capture(`${theme}-detail-source-320`);
  await nav('設定');await page.getByRole('radio',{name:/^ノーマル/}).click();await nav('学習帳');await capture(`${theme}-to-normal`);expect(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundImage)).not.toContain(`/themes/${theme}/`);
  await nav('設定');await page.getByRole('radio',{name:new RegExp(`^${theme==='cool'?'クール':'キュート'}`)}).click();await page.reload();await page.locator('.page--settings').waitFor();expect(await page.evaluate(()=>document.documentElement.dataset.theme)).toBe(theme);
  await nav('学習帳');await page.emulateMedia({reducedMotion:'reduce'});await capture(`${theme}-reduced-motion`);expect(await page.locator('.problem-card').first().evaluate(el=>getComputedStyle(el,'::after').animationName)).toBe('none');expect(await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'))).toBe(initial);await ctx.close();
  const empty=await open(theme,true);
  for(const route of ['テスト','学習教材']){await nav(route);await capture(`${theme}-${route==='テスト'?'zero-test':'empty-materials'}-390`);}
  await page.setViewportSize({width:320,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await capture(`${theme}-empty-text150`);await empty.ctx.close();
  const fallback=await open(theme,false,true);await nav('学習帳');await capture(`${theme}-missing-images-390`);await page.setViewportSize({width:1440,height:900});await capture(`${theme}-missing-images-1440`);expect(new Set(fallback.failed).size).toBe(2);results.push({name:`${theme}-image-failure-fallback`,failed:[...new Set(fallback.failed)]});await fallback.ctx.close();
 }
 expect(errors).toEqual([]);await writeFile(`${out}art-results.json`,JSON.stringify({status:'pass',results,errors},null,2));console.log(JSON.stringify({status:'pass',records:results.length}));
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:`${out}failure.png`,animations:'disabled'});await writeFile(`${out}art-results.json`,JSON.stringify({status:'fail',message:String(error),results,errors},null,2));throw error;}finally{await browser.close();}
