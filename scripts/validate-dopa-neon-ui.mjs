import { discardFixtureDraft } from './editor-ui-helpers.mjs';
// Synthetic local profiles and the two owner-supplied decorative assets only.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const out = new URL('../evidence/dopa-neon/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176';
const browser = await chromium.launch({ headless: true });
const errors = [], results = [];
let page;
const when = '2026-10-05T00:00:00Z';
const hand = ['1m','2m','3m','1p','2p','3p','1s','2s','3s','4s','0s','5s','7z','7z'];
const base = { title:'検証用：判断の理由を振り返る', concealed:hand, drawn:null, melds:[], doraIndicators:['4z'], answerEnabled:true, acceptedDiscards:['7z'], explanation:'解説を確認する。', privateMemo:'', tagIds:[], context:{roundWind:'1z',handNumber:1,seatWind:'1z',turn:6,honba:0,riichiSticks:0,ownRank:null,scores:{east:25000,south:25000,west:25000,north:25000}}, attachments:[],sourceUrl:'',createdAt:when,updatedAt:when };
const problems = [base, {...base,title:'長い題名の検証：牌効率と残り枚数を確認して判断の理由を整理する'}, {...base,title:'正解なしの学習ノート',answerEnabled:false,acceptedDiscards:[]}].map((p,i)=>({...p,id:`neon-${i}`}));
const seed = {schemaVersion:1,revision:0,problems,tags:[],study:problems.map(p=>({problemId:p.id,contentRevision:0,confirmationCount:0,lastConfirmedAt:null,understanding:'unrated',lastReviewedAt:null,inTest:true})),attempts:[],settings:{autoSort:true},daily:{},materials:[],materialStudyEvents:[]};
const assets = [
 ['neon-trails-background.jpg','df70eaa9c6364ac15548486948f5dd4bf50307fc3645d816f99c5549e002bd7c',960,524],
 ['neon-wave-card.jpg','f84271de459bbaae2b6ae3979fa9e6a349c56d517af0dd9af1b7ec76e03677d3',465,260],
];
async function nav(name) {
 await page.getByRole('link',{name,exact:true}).click(); await discardFixtureDraft(page);
 await page.locator({'作成':'.page--editor','学習帳':'.page--library','設定':'.page--settings','テスト':'.page--test','学習教材':'.page--materials'}[name]).waitFor({state:'visible'});
}
async function capture(name) {
 await page.evaluate(()=>document.fonts.ready);
 const cards=page.locator('.problem-card');
 if(await cards.count())await expect.poll(()=>cards.first().evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
 const g=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,height:innerHeight,nav:(()=>{const el=document.querySelector('.bottom-nav'),s=getComputedStyle(el),r=el.getBoundingClientRect();return {top:r.top,borders:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth],radius:s.borderRadius};})(),theme:document.documentElement.dataset.theme}));
 expect(g.documentWidth).toBeLessThanOrEqual(g.width);
 if(g.width<1100)expect(g.nav.borders).toEqual(['1px','0px','0px','0px']);
 await page.screenshot({path:`${out}${name}.png`,animations:'disabled'});results.push({name,...g});
}
try {
 for(const [name,hash] of assets){const bytes=await readFile(new URL(`../public/themes/dopa/${name}`,import.meta.url));expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);}
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await ctx.addInitScript(data=>{if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(data));localStorage.setItem('mahjong-study:theme','dopa');},seed);
 page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 const loaded=await page.evaluate(async assetNames=>Promise.all(assetNames.map(name=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve({name,width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>reject(new Error(`Cannot load ${name}`));img.src=new URL(`themes/dopa/${name}`,location.href.split('#')[0]).href;}))),assets.map(a=>a[0]));
 loaded.forEach((item,i)=>{expect(item.width).toBe(assets[i][2]);expect(item.height).toBe(assets[i][3]);});results.push({name:'original-assets-loaded',loaded});
 for(const width of [320,375,390,1440]){
  await page.setViewportSize({width,height:width===1440?900:667});await nav('作成');await page.evaluate(()=>scrollTo(0,0));await capture(`dopa-editor-${width}`);
  const css=await page.evaluate(()=>({background:getComputedStyle(document.documentElement).backgroundImage,streak:getComputedStyle(document.querySelector('.context-panel'),'::before').animationName,pointer:getComputedStyle(document.querySelector('.context-panel'),'::before').pointerEvents}));
  expect(css.background).toContain('neon-trails-background.jpg');expect(css.streak).toBe('dopa-frame-streak');expect(css.pointer).toBe('none');results.push({name:`dopa-background-${width}`,...css});
  await nav('学習帳');await page.evaluate(()=>scrollTo(0,0));await capture(`dopa-library-${width}`);
  const cards=await page.locator('.problem-card').evaluateAll(items=>items.map(el=>{const a=getComputedStyle(el,'::after'),b=getComputedStyle(el,'::before');return {background:a.backgroundImage,pointer:[a.pointerEvents,b.pointerEvents],text:getComputedStyle(el).color};}));
  expect(cards).toHaveLength(3);for(const card of cards){expect(card.background).toContain('neon-wave-card.jpg');expect(card.pointer).toEqual(['none','none']);}results.push({name:`dopa-cards-${width}`,cards});
 }
 // Real time progresses between two captures; no opacity blinking or scale animation.
 await page.setViewportSize({width:390,height:844});await nav('作成');
 const frame=page.locator('.context-panel');
 const moving=()=>frame.evaluate(el=>{const s=getComputedStyle(el,'::before');return {angle:s.getPropertyValue('--dopa-streak-angle'),duration:s.animationDuration,opacity:s.opacity,pointer:s.pointerEvents};});
 const before=await moving();await page.screenshot({path:`${out}light-streak-before.png`});
 await page.waitForTimeout(1200);const after=await moving();await page.screenshot({path:`${out}light-streak-after.png`});
 expect(before.angle).not.toBe(after.angle);expect(before.opacity).toBe(after.opacity);expect(parseFloat(after.duration)).toBeGreaterThanOrEqual(9);results.push({name:'moving-frame-light',before,after});
 for(const route of ['作成','学習帳']){await nav(route);await page.setViewportSize({width:320,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await capture(`dopa-${route==='作成'?'editor':'library'}-320-text150`);await page.evaluate(()=>document.documentElement.style.fontSize='');}
 await page.emulateMedia({reducedMotion:'reduce'});await nav('学習帳');await capture('dopa-library-reduced-motion');
 const reduced=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().width).flatMap(e=>[getComputedStyle(e),getComputedStyle(e,'::before'),getComputedStyle(e,'::after')]).filter(s=>s.animationName!=='none').map(s=>s.animationName));expect(reduced).toEqual([]);results.push({name:'reduced-motion-static',animations:reduced});
 // Switching themes leaves no decorative photo or moving frame behind.
 await nav('設定');
 for(const [theme,label] of [['normal','ノーマル'],['cool','クール'],['cute','キュート']]){
  await page.getByRole('radio',{name:new RegExp(`^${label}`)}).click();await nav('学習帳');
  const styles=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,background:getComputedStyle(document.documentElement).backgroundImage,cards:[...document.querySelectorAll('.problem-card')].map(e=>({background:getComputedStyle(e,'::after').backgroundImage,streak:getComputedStyle(e,'::before').animationName}))}));
  expect(styles.theme).toBe(theme);expect(styles.background).not.toContain('neon-trails');for(const c of styles.cards){expect(c.background).not.toContain('neon-wave');expect(c.streak).toBe('none');}await capture(`isolation-${theme}-320`);results.push({name:`theme-isolation-${theme}`,...styles});await nav('設定');
 }
 await ctx.close();
 // Bare text needs a local dark backing even when a bright trail crosses the glyphs.
 for(const kind of ['empty','long-title']){
  const profile=structuredClone(seed);
  profile.problems=kind==='empty'?[]:[{...problems[0],title:'長い題名の検証：牌効率だけでなく、巡目や対局条件、残り枚数を確かめて判断の理由を振り返る'}];
  profile.study=kind==='empty'?[]:seed.study.slice(0,1);
  const edge=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await edge.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await edge.addInitScript(data=>{localStorage.setItem('mahjong-study:v1',JSON.stringify(data));localStorage.setItem('mahjong-study:theme','dopa');},profile);
  page=await edge.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`${origin}/#/test`);
  if(kind==='long-title')await page.getByRole('button',{name:'1 問でテスト開始',exact:true}).click();
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:width===1440?900:740});
   if(kind==='empty')await nav('テスト');
   await capture(`${kind}-test-${width}`);
   const target=page.locator(kind==='empty'?'.page--test > .hint[role=status]':'.test-title');await expect(target).toBeVisible();
   const backing=await target.evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,text:el.textContent}));
   expect(backing.background).toBe('rgba(9, 12, 30, 0.82)');results.push({name:`${kind}-backing-${width}`,...backing});
   if(kind==='empty'){
    await nav('学習教材');await expect(page.locator('.materials-empty')).toBeVisible();await capture(`empty-materials-${width}`);
    expect(await page.locator('.materials-empty').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(9, 12, 30, 0.82)');
   }
  }
  await page.setViewportSize({width:320,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await capture(`${kind}-text150`);await edge.close();
 }
 expect(errors).toEqual([]);await writeFile(`${out}neon-results.json`,JSON.stringify({status:'pass',results,errors},null,2));console.log(JSON.stringify({status:'pass',records:results.length}));
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:`${out}failure.png`,animations:'disabled'});await writeFile(`${out}neon-results.json`,JSON.stringify({status:'fail',message:String(error),results,errors},null,2));throw error;}finally{await browser.close();}
