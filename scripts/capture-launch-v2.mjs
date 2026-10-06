// Capture-only fixture: the published application is not modified.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const base = 'e4c7f440bd08d62274e33eab2adf3dcc9124ea96';
const out = new URL('../evidence/launch-v2/', import.meta.url).pathname;
await mkdir(out,{recursive:true});
const catalog = JSON.parse(await readFile(new URL('../src/data/sampleCatalogData.json',import.meta.url),'utf8'));
const now = '2026-10-05T15:00:00.000Z';
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
const appDiff=execFileSync('git',['diff','--name-only',base,'HEAD','--',...appPaths],{encoding:'utf8'}).trim();
if(appDiff)throw new Error(`Application differs from published commit: ${appDiff}`);
const origin='http://127.0.0.1:5176';
const browser=await chromium.launch({headless:true});
const screenshots=[];const errors=[];let page;
const provenance={publishedCommit:base,publishedTree:'255142817336a6fb485b7b7f85d6eed924128223',captureCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),appDiff,viewport:{width:390,height:1100},deviceScaleFactor:3,theme:'normal',fixture:'isolated introduction samples derived from bundled catalog; two user-selected videos only; no fabricated study history; no DOM or CSS substitution',sampleMap:specs.map(([i,title],index)=>({id:problems[index].id,catalogIndex:i,catalogTitle:catalog[i].title,introductionTitle:title,handAnswerUnchanged:true,explanationUnchanged:true})),materialSources,materials:materials.map(({title,url})=>({title,url})),screenshots,errors};
async function capture(name,selector){if(selector)await page.locator(selector).waitFor({state:'visible'});await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:`${out}${name}-full.png`,fullPage:true,animations:'disabled'});if(selector)await page.locator(selector).screenshot({path:`${out}${name}-region.png`,animations:'disabled'});screenshots.push({name,url:page.url(),selector,geometry:await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme}))});}
try{
 const context=await browser.newContext({viewport:{width:390,height:1100},deviceScaleFactor:3,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await context.addInitScript(s=>localStorage.setItem('mahjong-study:v1',JSON.stringify(s)),seed);
 await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin||u.protocol==='data:'||u.hostname==='i.ytimg.com'?route.continue():route.abort();});
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#/materials');
 await expect(page.getByRole('heading',{name:'学習教材',exact:true})).toBeVisible();
 await expect(page.locator('.material-card')).toHaveCount(2);
 await expect(page.locator('.material-card h2')).toHaveText(materials.map(m=>m.title));
 await expect(page.locator('.material-thumbnail img')).toHaveCount(2);
 for(let i=0;i<materials.length;i++){
  const img=page.locator('.material-thumbnail img').nth(i);
  await img.scrollIntoViewIfNeeded();
  await expect.poll(()=>img.evaluate(el=>el.complete&&el.naturalWidth>=320),{timeout:20000}).toBe(true);
  await expect(page.locator('.material-direct-link').nth(i)).toHaveAttribute('href',materials[i].url);
 }
 await page.locator('.material-list').scrollIntoViewIfNeeded();
 await page.evaluate(()=>document.fonts.ready);
 provenance.thumbnails=await page.locator('.material-thumbnail').evaluateAll(els=>els.map(el=>({image:el.querySelector('img')?{src:el.querySelector('img').currentSrc,complete:el.querySelector('img').complete,naturalWidth:el.querySelector('img').naturalWidth,naturalHeight:el.querySelector('img').naturalHeight}:null,fallback:!!el.querySelector('.material-thumbnail__placeholder')})));
 const listBox=await page.locator('.material-list').boundingBox();
 provenance.materialGeometry=await page.locator('.material-card').evaluateAll((els,lb)=>els.map(el=>{const relative=(node)=>{const r=node.getBoundingClientRect();return {x:r.x-lb.x,y:r.y-lb.y,width:r.width,height:r.height}};return {card:relative(el),title:relative(el.querySelector('h2')),thumbnail:relative(el.querySelector('.material-thumbnail')),body:relative(el.querySelector('.material-card__body')),actions:relative(el.querySelector('.material-card__actions'))}}),listBox);
 await capture('04-materials','.material-list');
 expect(provenance.thumbnails.every(t=>t.image?.complete&&t.image.naturalWidth>=320&&!t.fallback)).toBe(true);
 expect(errors).toEqual([]);
 await writeFile(`${out}provenance.json`,JSON.stringify({...provenance,status:'pass'},null,2));
 console.log(JSON.stringify({status:'pass',screenshots:screenshots.length,thumbnails:provenance.thumbnails,materialGeometry:provenance.materialGeometry}));
}catch(error){if(page)await page.screenshot({path:`${out}failure.png`,fullPage:true});await writeFile(`${out}provenance.json`,JSON.stringify({...provenance,status:'fail',message:String(error)},null,2));throw error;}finally{await browser.close();}
