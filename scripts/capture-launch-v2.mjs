// Capture-only fixture: the published application is not modified.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const base = '1a2f413f720a9b7146709564b75d851d60add03c';
const out = new URL('../evidence/launch-wide/', import.meta.url).pathname;
await mkdir(out,{recursive:true});
const catalog = JSON.parse(await readFile(new URL('../src/data/sampleCatalogData.json',import.meta.url),'utf8'));
const now = new Date().toISOString();
const specs = [
 [1,'両面を残す？ 受入れを比べる',['efficiency','ryanmen']],
 [0,'孤立した北、残す？ 切る？',['efficiency','basic']],
 [2,'同じ受入れなら、どちらを切る？',['efficiency','shape']],
];
const problems = specs.map(([i,title,tagIds],index)=>{const {sampleId,contentVersion,...p}=catalog[i];return {...p,id:`launch-sample-${index+1}`,title,tagIds,createdAt:now,updatedAt:now};});
const tags = [{id:'efficiency',name:'牌効率'},{id:'ryanmen',name:'両面・カンチャン'},{id:'basic',name:'基本形'},{id:'shape',name:'複合形'}];
// User-selected video metadata is filled from verified official YouTube sources.
const materialSources = [
  {
    "id": "2LjOtn6pgb8",
    "title": "【麻雀講座】座学のし過ぎで打数少ない系天鳳位の座学講座【ヨーテル】",
    "url": "https://www.youtube.com/watch?v=2LjOtn6pgb8",
    "officialMetadataSource": "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=2LjOtn6pgb8&format=json",
    "author": "ヨーテル　Yoteru Ch. 【天鳳位】",
    "authorUrl": "https://www.youtube.com/@yoteru",
    "officialThumbnailUrl": "https://i.ytimg.com/vi/2LjOtn6pgb8/hqdefault.jpg",
    "appThumbnailUrl": "https://i.ytimg.com/vi/2LjOtn6pgb8/mqdefault.jpg",
    "verifiedAt": "2026-10-06T01:45:30Z"
  },
  {
    "id": "7x95Yi51w3k",
    "title": "【麻雀講座】たった１日で初心者が中級者になれる３大原則",
    "url": "https://www.youtube.com/watch?v=7x95Yi51w3k",
    "officialMetadataSource": "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=7x95Yi51w3k&format=json",
    "author": "ヨーテル　Yoteru Ch. 【天鳳位】",
    "authorUrl": "https://www.youtube.com/@yoteru",
    "officialThumbnailUrl": "https://i.ytimg.com/vi/7x95Yi51w3k/hqdefault.jpg",
    "appThumbnailUrl": "https://i.ytimg.com/vi/7x95Yi51w3k/mqdefault.jpg",
    "verifiedAt": "2026-10-06T01:45:30Z"
  }
];
const materials = materialSources.map((v,index)=>({id:`launch-video-${index+1}`,title:v.title,url:v.url,comment:'',createdAt:now,updatedAt:now}));
const seed={schemaVersion:1,revision:0,problems,tags,study:problems.map(p=>({problemId:p.id,contentRevision:0,confirmationCount:0,lastConfirmedAt:null,understanding:'unrated',lastReviewedAt:null,lastSolvedAt:null,lastCorrectAt:null,inTest:true})),attempts:[],settings:{autoSort:true},daily:{},materials,materialStudyEvents:[]};
const appPaths=['src','public','package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json'];
const appCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(appCommit!==base)throw new Error(`Unexpected application commit ${appCommit}`);
const appDiff=execFileSync('git',['diff','--name-only',base,'--',...appPaths],{encoding:'utf8'}).trim();
if(appDiff)throw new Error(`Application differs from published commit: ${appDiff}`);
const origin='http://127.0.0.1:5176';
const browser=await chromium.launch({headless:true});
const screenshots=[];const errors=[];const actions=[];let page;
const provenance={publishedCommit:base,publishedTree:'373c8afd37e7adcfb8a05221f303bc90a72d42df',publishedPagesRun:'https://github.com/SalsNoah/mj_study/actions/runs/37399254691',captureScriptCommit:process.env.GITHUB_SHA,appCommit,appDiff,deviceScaleFactor:3,theme:'normal',fixture:'isolated introduction samples derived from bundled catalog; no seeded attempts or daily history; all six test records are created by actual UI answers in this capture session; no date mocking; no DOM or CSS substitution',sampleMap:specs.map(([i,title],index)=>({id:problems[index].id,catalogIndex:i,catalogTitle:catalog[i].title,introductionTitle:title,handAnswerUnchanged:true,explanationUnchanged:true})),materialSources,screenshots,actions,errors};
async function settle(){await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function capture(name,selector){await page.locator(selector).waitFor({state:'visible'});await settle();await page.screenshot({path:`${out}${name}-full.png`,fullPage:true,animations:'disabled'});await page.locator(selector).screenshot({path:`${out}${name}-region.png`,animations:'disabled'});screenshots.push({name,url:page.url(),selector,box:await page.locator(selector).boundingBox(),geometry:await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme}))});}
async function widthsCapture(stem,selector){for(const width of [960,640]){await page.setViewportSize({width,height:1000});await capture(`${stem}-${width}`,selector);}}
async function readStore(){return page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')));}
function tileLabel(c){if(c[1]==='z')return ['東','南','西','北','白','發','中'][Number(c[0])-1];return (c[0]==='0'?'赤五':['','一','二','三','四','五','六','七','八','九'][Number(c[0])])+({m:'萬',p:'筒',s:'索'}[c[1]]);}
try{
 const context=await browser.newContext({viewport:{width:960,height:1000},deviceScaleFactor:3,serviceWorkers:'block',timezoneId:'Asia/Tokyo'});
 // Only the fresh isolated browser context is seeded. Route changes below use SPA links.
 await context.addInitScript(s=>{if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(s));},seed);
 await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin||u.protocol==='data:'||u.hostname==='i.ytimg.com'?route.continue():route.abort();});
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 await page.getByRole('link',{name:'学習帳',exact:true}).click();await expect(page.locator('.problem-card')).toHaveCount(3);
 provenance.initialStore=await readStore();expect(provenance.initialStore.attempts).toHaveLength(0);expect(Object.keys(provenance.initialStore.daily)).toHaveLength(0);
 await widthsCapture('02-library','.page--library');
 for(const width of [960,640]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));await settle();const cards=page.locator('.problem-card');const first=await cards.nth(0).boundingBox(),second=await cards.nth(1).boundingBox();const clip={x:Math.floor(first.x),y:Math.floor(first.y),width:Math.ceil(Math.max(first.x+first.width,second.x+second.width)-Math.floor(first.x)),height:Math.ceil(second.y+second.height-Math.floor(first.y))};await page.screenshot({path:`${out}02-library-first-two-${width}.png`,clip,animations:'disabled'});screenshots.push({name:`02-library-first-two-${width}`,clip,geometry:{width,height:1000,dpr:3}});}
 await page.getByRole('link',{name:'テスト',exact:true}).click();await expect(page.getByRole('button',{name:'3 問でテスト開始',exact:true})).toBeVisible();
 await widthsCapture('03-test-setup','.page--test');
 let representativeCaptured=false;
 for(let round=0;round<2;round++){
  await page.getByRole('button',{name:'3 問でテスト開始',exact:true}).click();
  for(let index=0;index<3;index++){
   await expect(page.locator('.test-title')).toBeVisible();const title=await page.locator('.test-title').innerText();const problem=problems.find(p=>p.title===title);if(!problem)throw new Error(`Unexpected question ${title}`);
   const representative=!representativeCaptured&&problem.id===problems[0].id;
   if(representative)await widthsCapture('03-test-question','.page--test');
   const tile=problem.acceptedDiscards[0];await page.locator('.hand-stage').getByRole('button',{name:tileLabel(tile),exact:true}).first().click();await page.getByRole('button',{name:'回答する',exact:true}).click();
   await expect(page.locator('.verdict')).toHaveText('正解');
   const store=await readStore();expect(store.attempts).toHaveLength(round*3+index+1);
   actions.push({method:'actual UI tile click and Answer button',round:round+1,index:index+1,title,tile,storedAttempt:store.attempts.at(-1),daily:store.daily});
   if(representative){await widthsCapture('03-test-answer','.page--test');representativeCaptured=true;}
   await page.getByRole('button',{name:index===2?'結果を見る':'次の問題へ',exact:true}).click();
  }
  await expect(page.getByRole('heading',{name:'テスト結果',exact:true})).toBeVisible();
  if(round===0){provenance.afterThree=await readStore();await page.getByRole('button',{name:'もう一度',exact:true}).click();}
 }
 await widthsCapture('03-test-result','.page--test');
 await page.getByRole('link',{name:'記録帳を見る',exact:true}).click();await expect(page.getByRole('heading',{name:'記録帳',exact:true})).toBeVisible();
 provenance.afterSix=await readStore();expect(provenance.afterSix.attempts).toHaveLength(6);expect(Object.keys(provenance.afterSix.daily)).toHaveLength(1);expect(Object.values(provenance.afterSix.daily)[0].tested).toBe(6);
 await expect(page.locator('.stat-grid .stat').nth(0).locator('strong')).toHaveText('6');await expect(page.locator('.stat-grid .stat').nth(2).locator('strong')).toHaveText('6');
 await expect(page.getByRole('tab',{name:'日別',exact:true})).toHaveAttribute('aria-selected','true');
 await widthsCapture('03-records','.page--records');
 await widthsCapture('03-records-chart','.records-history');
 await widthsCapture('03-records-totals','.stat-grid');
 provenance.recordChartTexts=await page.locator('.records-history').innerText();
 await page.locator('.bottom-nav a[href="#/materials"]').click();await expect(page.locator('.material-card')).toHaveCount(2);
 await expect(page.locator('.material-card h2')).toHaveText(materials.map(m=>m.title));
 for(let i=0;i<2;i++){const img=page.locator('.material-thumbnail img').nth(i);await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate(el=>el.complete&&el.naturalWidth>=320),{timeout:20000}).toBe(true);await expect(img).toHaveAttribute('src',materialSources[i].appThumbnailUrl);}
 provenance.thumbnails=await page.locator('.material-thumbnail img').evaluateAll(els=>els.map(el=>({src:el.currentSrc,complete:el.complete,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight})));
 await widthsCapture('04-materials','.material-list');
 expect(errors).toEqual([]);await writeFile(`${out}provenance.json`,JSON.stringify({...provenance,status:'pass'},null,2));console.log(JSON.stringify({status:'pass',screenshots:screenshots.length,actions:actions.length,appCommit,appDiff}));
}catch(error){if(page)await page.screenshot({path:`${out}failure.png`,fullPage:true});await writeFile(`${out}provenance.json`,JSON.stringify({...provenance,status:'fail',message:String(error)},null,2));throw error;}finally{await browser.close();}
