// Synthetic local profiles only; no external documents, images, or credentials.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('../evidence/theme-ui/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176';
const browser = await chromium.launch({ headless: true });
let page;
const results = [], errors = [];
const when = '2026-10-05T00:00:00Z';
const hand = ['1m','2m','3m','1p','2p','3p','1s','2s','3s','4s','0s','5s','7z','7z'];
const problem = { id:'theme-question',title:'検証用：判断の理由を振り返る',concealed:hand,drawn:null,melds:[],doraIndicators:['4z'],answerEnabled:true,acceptedDiscards:['7z'],explanation:'問題の解説を確認する。',privateMemo:'気づいた点を記録する。',tagIds:[],context:{roundWind:'1z',handNumber:1,seatWind:'1z',turn:6,honba:0,riichiSticks:0,ownRank:null,scores:{east:25000,south:25000,west:25000,north:25000}},attachments:[],sourceUrl:'',createdAt:when,updatedAt:when };
const seed = { schemaVersion:1,revision:0,problems:[problem],tags:[],study:[{problemId:problem.id,contentRevision:0,confirmationCount:0,lastConfirmedAt:null,understanding:'unrated',lastReviewedAt:null,inTest:true}],attempts:[],settings:{autoSort:true},daily:{},materials:[{id:'theme-material',title:'学習教材の判断を振り返る',url:'https://example.com/lesson',comment:'復習のポイント',createdAt:when,updatedAt:when}],materialStudyEvents:[] };
async function open(profile = seed) {
 const ctx = await browser.newContext({ viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block' });
 await ctx.addInitScript(data => { if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(data)); },profile);
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);return ctx;
}
async function nav(name) { await page.getByRole('link',{name,exact:true}).click(); }
async function capture(name, selector) {
 if(selector)await page.locator(selector).evaluate(el=>el.scrollIntoView({block:'center'}));else await page.evaluate(()=>scrollTo(0,0));
 await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${out}${name}.png`,animations:'disabled'});
 const g=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,headings:[...document.querySelectorAll('h1,.section-title,summary')].filter(el=>el.getBoundingClientRect().width).map(el=>{const s=getComputedStyle(el),m=getComputedStyle(el,'::before');return {text:el.textContent,font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,line:s.lineHeight,marker:[m.borderLeftWidth,m.borderTopWidth,m.borderBottomWidth],height:el.getBoundingClientRect().height};})}));
 expect(g.documentWidth).toBeLessThanOrEqual(g.width);results.push({name,...g});
}
async function mainDisclosures(name) {
 const styles=await page.locator('.editor-tools > details > summary').evaluateAll(items=>items.map(el=>{const s=getComputedStyle(el),m=getComputedStyle(el,'::before');return {font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,line:s.lineHeight,letter:s.letterSpacing,marker:[m.borderLeftWidth,m.borderTopWidth,m.borderBottomWidth],height:el.getBoundingClientRect().height};}));
 expect(styles).toHaveLength(2);expect(styles[0]).toEqual(styles[1]);expect(styles[0].height).toBeGreaterThanOrEqual(44);results.push({name:`${name}-matching-disclosures`,styles});
}
try {
 const ctx=await open();await nav('設定');const original=await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'));
 await expect(page.getByRole('radio')).toHaveCount(5);const moe=page.getByRole('radio',{name:/萌え/});await expect(moe).toBeDisabled();await expect(moe).toHaveAttribute('aria-checked','false');
 const labels={normal:'ノーマル',cool:'クール',cute:'キュート',dopa:'DOPA'};
 for(const theme of ['normal','cool','cute','dopa']) {
  await page.getByRole('radio',{name:new RegExp(`^${labels[theme]}`)}).click();await page.reload();
  expect(await page.evaluate(()=>document.documentElement.dataset.theme)).toBe(theme);expect(await page.evaluate(()=>localStorage.getItem('mahjong-study:theme'))).toBe(theme);
  await expect(page.getByRole('radio',{name:new RegExp(`^${labels[theme]}`)})).toHaveAttribute('aria-checked','true');await capture(`theme-picker-${theme}-390`);
 }
 await page.getByRole('radio',{name:/^DOPA/}).press('ArrowRight');await expect(page.getByRole('radio',{name:/^ノーマル/})).toBeFocused();await page.getByRole('radio',{name:/^ノーマル/}).press('End');await expect(page.getByRole('radio',{name:/^DOPA/})).toBeFocused();await expect(moe).toBeDisabled();expect(await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'))).toBe(original);results.push({name:'theme-persistence-keyboard-moe-disabled',status:'pass'});
 for(const theme of ['normal','dopa']) {
  await nav('設定');await page.getByRole('tab',{name:'表示・編集',exact:true}).click();await page.getByRole('radio',{name:new RegExp(`^${labels[theme]}`)}).click();
  for(const width of [375,1440]) {
   await page.setViewportSize({width,height:width===1440?900:740});
   await nav('作成');await capture(`${theme}-editor-${width}`);await mainDisclosures(`${theme}-${width}`);await capture(`${theme}-editor-disclosures-${width}`,'.editor-tools');
   await page.locator('.editor-notes > summary').click();await capture(`${theme}-editor-notes-${width}`,'.editor-notes');
   await nav('学習帳');await capture(`${theme}-library-${width}`);await page.locator('.library-filters > summary').click();await capture(`${theme}-library-filters-${width}`,'.library-filters');
   await page.locator('.problem-card').click();await capture(`${theme}-detail-${width}`);await page.getByRole('button',{name:'正解・解説を表示',exact:true}).click();await page.locator('.detail-tools > summary').click();await expect(page.getByRole('button',{name:'PNG保存',exact:true})).toHaveCount(0);await capture(`${theme}-detail-tools-${width}`,'.detail-tools');
   await page.getByRole('button',{name:'複製',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await capture(`${theme}-duplicate-dialog-${width}`);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'複製',exact:true})).toBeFocused();
   await nav('テスト');await capture(`${theme}-test-setup-${width}`);
   await page.getByRole('button',{name:'1 問でテスト開始',exact:true}).click();await capture(`${theme}-test-question-${width}`);await page.locator('.hand-stage').getByRole('button',{name:'中',exact:true}).first().click();await page.getByRole('button',{name:'回答する',exact:true}).click();await capture(`${theme}-test-answer-${width}`);
   await nav('学習教材');await capture(`${theme}-materials-${width}`);await page.locator('.material-record-link').click();await capture(`${theme}-material-detail-${width}`);
   await nav('記録帳');await capture(`${theme}-records-${width}`,'.records-titles');await page.getByRole('tab',{name:'月別',exact:true}).click();await page.locator('.records-values:visible > summary').click();await capture(`${theme}-record-values-${width}`,'.records-values[open]:visible');
   await nav('設定');await capture(`${theme}-settings-${width}`);await page.getByRole('tab',{name:'データ管理',exact:true}).click();await capture(`${theme}-settings-data-${width}`);
  }
  await page.setViewportSize({width:320,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await nav('作成');await mainDisclosures(`${theme}-text150`);await capture(`${theme}-disclosures-text150`,'.editor-tools');await nav('設定');await capture(`${theme}-picker-text150`);await page.evaluate(()=>document.documentElement.style.fontSize='');
 }
 await nav('作成');
 const activeNav=await page.locator('.bottom-nav__item.is-active').evaluate(el=>({background:getComputedStyle(el).backgroundImage,color:getComputedStyle(el).color,current:el.getAttribute('aria-current')}));expect(activeNav.background).toContain('linear-gradient');expect(activeNav.color).toBe('rgb(9, 11, 24)');expect(activeNav.current).toBe('page');results.push({name:'dopa-active-tab-rainbow-surface',...activeNav});
 for(const name of ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','赤五索','五索','中','中'])await page.locator('.tile-palette').getByRole('button',{name,exact:true}).click();
 for(const width of [375,390]){await page.setViewportSize({width,height:667});await page.evaluate(()=>scrollTo(0,0));const fit=await page.evaluate(()=>({paletteBottom:document.querySelector('.editor-palette').getBoundingClientRect().bottom,navTop:document.querySelector('.bottom-nav').getBoundingClientRect().top}));expect(fit.paletteBottom).toBeLessThanOrEqual(fit.navTop+1);await capture(`dopa-editor-full-${width}-667`);results.push({name:`dopa-editor-${width}-no-scroll`,...fit});}
 await page.setViewportSize({width:320,height:740});const motion=await page.evaluate(()=>[...document.querySelectorAll('.panel,.btn,.hand-stage')].filter(el=>el.getBoundingClientRect().width).map(el=>({name:getComputedStyle(el).animationName,duration:getComputedStyle(el).animationDuration})).filter(x=>x.name.startsWith('dopa-')));expect(motion.length).toBeGreaterThan(0);for(const item of motion)expect(parseFloat(item.duration)).toBeGreaterThanOrEqual(9);results.push({name:'dopa-slow-color-motion',motion});
 const colors=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['--ink','--muted','--panel-solid','--surface'].map(key=>[key,s.getPropertyValue(key).trim()]));});
 const luminance=hex=>{const channels=hex.replace('#','').match(/../g).map(h=>parseInt(h,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];};
 const contrasts=[];for(const text of ['--ink','--muted'])for(const bg of ['--panel-solid','--surface']){const a=luminance(colors[text]),b=luminance(colors[bg]),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);expect(ratio).toBeGreaterThanOrEqual(4.5);contrasts.push({text,bg,ratio});}results.push({name:'dopa-solid-text-contrast',colors,contrasts});
 await page.emulateMedia({reducedMotion:'reduce'});const reduced=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().width).flatMap(el=>[getComputedStyle(el),getComputedStyle(el,'::before'),getComputedStyle(el,'::after')]).filter(s=>s.animationName!=='none').map(s=>s.animationName));expect(reduced).toEqual([]);await capture('dopa-reduced-motion-320');results.push({name:'dopa-reduced-motion',animations:reduced});
 await ctx.close();
 const duplicateCtx=await open();await nav('学習帳');await page.locator('.problem-card').click();await page.locator('.detail-tools > summary').click();
 const originalDuplicate=await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'));const trigger=page.getByRole('button',{name:'複製',exact:true});
 for(const method of ['cancel','escape','outside']){
  await trigger.click();await expect(page.getByRole('dialog')).toContainText(problem.title);await expect(page.getByRole('button',{name:'キャンセル',exact:true})).toBeFocused();
  if(method==='cancel')await page.getByRole('button',{name:'キャンセル',exact:true}).click();else if(method==='escape')await page.keyboard.press('Escape');else await page.locator('.duplicate-confirmation-backdrop').click({position:{x:4,y:4}});
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(trigger).toBeFocused();expect(await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'))).toBe(originalDuplicate);
 }
 await trigger.click();await page.keyboard.press('Shift+Tab');await expect(page.getByRole('button',{name:'複製する',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'キャンセル',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'複製する',exact:true}).dblclick();await expect(page.getByRole('dialog')).toHaveCount(0);
 const duplicated=await page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')));expect(duplicated.problems).toHaveLength(2);expect(duplicated.problems[0].id).toBe(problem.id);expect(duplicated.problems[1].concealed).toEqual(hand);await expect(page.getByRole('button',{name:'PNG保存',exact:true})).toHaveCount(0);results.push({name:'duplicate-confirm-cancel-focus-and-single-copy',status:'pass',problemCount:2});await duplicateCtx.close();
 const sampleCtx=await open({...structuredClone(seed),problems:[],study:[],materials:[],materialStudyEvents:[]});await nav('学習帳');await page.getByRole('button',{name:'サンプルを追加',exact:true}).click();
 for(const width of [320,375,390,1440]){await page.setViewportSize({width,height:width===1440?900:740});await capture(`library-sample-entry-${width}`);}
 await page.setViewportSize({width:320,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await capture('library-sample-entry-text150');await page.evaluate(()=>document.documentElement.style.fontSize='');
 await page.getByRole('button',{name:'サンプル10題を追加',exact:true}).click();await expect(page.getByRole('button',{name:'この10題は追加済み',exact:true})).toBeDisabled();
 const added=await page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')));expect(added.problems).toHaveLength(10);expect(added.problems.filter(p=>p.answerEnabled)).toHaveLength(8);await capture('library-samples-added');
 await page.getByRole('button',{name:'サンプルを閉じる',exact:true}).click();await expect(page.locator('#library-sample-panel')).toHaveCount(0);await expect(page.locator('.problem-card')).toHaveCount(10);await sampleCtx.close();
 const missingId=added.problems.at(-1).id;const partial={...added,problems:added.problems.slice(0,-1),study:added.study.filter(s=>s.problemId!==missingId)};const partialCtx=await open(partial);await nav('学習帳');await page.getByRole('button',{name:'サンプルを追加',exact:true}).click();await page.getByRole('button',{name:'サンプル1題を追加',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')).problems.length)).toBe(10);results.push({name:'library-safe-sample-entry',status:'pass',answers:8,answerless:2,missingAdded:1});await partialCtx.close();
 expect(errors).toEqual([]);await writeFile(`${out}theme-results.json`,JSON.stringify({status:'pass',results,errors},null,2));console.log(JSON.stringify({status:'pass',records:results.length}));
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:`${out}failure.png`,animations:'disabled'});await writeFile(`${out}theme-results.json`,JSON.stringify({status:'fail',message:String(error),results,errors},null,2));throw error;}finally{await browser.close();}
