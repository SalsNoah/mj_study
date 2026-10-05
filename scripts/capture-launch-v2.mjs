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
// Real videos, with original titles and URLs documented by their author.
const materialSource = 'https://note.com/hirajangeki/n/nf8e7b490e2ff';
const materials = [
 {id:'launch-video-1',title:'【麻雀牌効率講座】迷う何切るは「満貫」「両面（リャンメン）」待ちを基準に考える。',url:'https://www.youtube.com/watch?v=-kPkFx_7j-4',comment:'',createdAt:now,updatedAt:now},
 {id:'launch-video-2',title:'【手作り講座02】現代麻雀黄金のセオリー「５ブロック理論」',url:'https://www.youtube.com/watch?v=FKUxh_TFmOU',comment:'',createdAt:now,updatedAt:now},
 {id:'launch-video-3',title:'【麻雀押し引き講座】テンパイからでもベタオリ？ワンランク上の上級押し引きのポイントを解説',url:'https://www.youtube.com/watch?v=pliVCj8KPgo',comment:'',createdAt:now,updatedAt:now},
];
const seed={schemaVersion:1,revision:0,problems,tags,study:problems.map(p=>({problemId:p.id,contentRevision:0,confirmationCount:0,lastConfirmedAt:null,understanding:'unrated',lastReviewedAt:null,lastSolvedAt:null,lastCorrectAt:null,inTest:true})),attempts:[],settings:{autoSort:true},daily:{},materials,materialStudyEvents:[]};
const appPaths=['src','public','package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json'];
const appDiff=execFileSync('git',['diff','--name-only',base,'HEAD','--',...appPaths],{encoding:'utf8'}).trim();
if(appDiff)throw new Error(`Application differs from published commit: ${appDiff}`);
const origin='http://127.0.0.1:5176';
const browser=await chromium.launch({headless:true});
const screenshots=[];const errors=[];let page;
const provenance={publishedCommit:base,publishedTree:'255142817336a6fb485b7b7f85d6eed924128223',captureCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),appDiff,viewport:{width:390,height:1100},deviceScaleFactor:3,theme:'normal',fixture:'isolated introduction samples derived from bundled catalog; no fabricated study history; no DOM or CSS substitution',sampleMap:specs.map(([i,title],index)=>({id:problems[index].id,catalogIndex:i,catalogTitle:catalog[i].title,introductionTitle:title,handAnswerExplanationUnchanged:true})),materialSource,materials:materials.map(({title,url})=>({title,url})),screenshots,errors};
async function capture(name,selector){await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${out}${name}-full.png`,fullPage:true,animations:'disabled'});if(selector)await page.locator(selector).screenshot({path:`${out}${name}-region.png`,animations:'disabled'});screenshots.push({name,url:page.url(),selector,geometry:await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme}))});}
try{
 const context=await browser.newContext({viewport:{width:390,height:1100},deviceScaleFactor:3,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await context.addInitScript(s=>localStorage.setItem('mahjong-study:v1',JSON.stringify(s)),seed);
 await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin||u.protocol==='data:'||u.hostname==='i.ytimg.com'?route.continue():route.abort();});
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 await page.getByRole('link',{name:'学習帳',exact:true}).click();await expect(page.locator('.problem-card')).toHaveCount(3);
 await capture('01-library','.problem-list');
 await page.evaluate(()=>scrollTo(0,0));
 const twoCards=await page.locator('.problem-card').evaluateAll(nodes=>{const first=nodes[0].getBoundingClientRect(),last=nodes[1].getBoundingClientRect();return {x:0,y:first.top+scrollY-6,width:390,height:last.bottom-first.top+12}});
 await page.screenshot({path:`${out}01-library-two-cards.png`,clip:twoCards,animations:'disabled'});provenance.libraryTwoCardsClip=twoCards;
 await page.setViewportSize({width:460,height:1100});await page.evaluate(()=>scrollTo(0,0));
 await capture('01-library-460','.problem-list');
 const twoWide=await page.locator('.problem-card').evaluateAll(nodes=>{const a=nodes[0].getBoundingClientRect(),b=nodes[1].getBoundingClientRect();return {x:0,y:a.top+scrollY-6,width:460,height:b.bottom-a.top+12}});
 await page.screenshot({path:`${out}01-library-two-cards-460.png`,clip:twoWide,animations:'disabled'});provenance.libraryTwoCards460Clip=twoWide;
 await page.setViewportSize({width:390,height:1100});
 // The same saved question becomes the editor and review example.
 await page.locator('.problem-card').first().click();await expect(page.getByRole('button',{name:'正解・解説を表示',exact:true})).toBeVisible();await capture('01-detail-question','.page');
 await page.getByRole('button',{name:'正解・解説を表示',exact:true}).click();await capture('02-detail-explanation','.page');
 await page.getByRole('tab',{name:'受入れ',exact:true}).click();await capture('02-detail-ukeire','.page');
 await page.getByRole('link',{name:'編集',exact:true}).click();await capture('02-editor','.page--editor');
 await page.locator('.editor-notes > summary').click();await expect(page.locator('.editor-notes textarea').first()).toHaveValue(problems[0].explanation);await capture('02-editor-notes','.editor-notes');
 await page.getByRole('link',{name:'テスト',exact:true}).click();await page.locator('.page--test details > summary').click();await expect(page.locator('.filter-chip')).toHaveCount(5);await capture('03-test-conditions','.page--test details');
 // Select the one tagged sample using actual app controls, then answer it.
 await page.locator('.filter-chip').filter({hasText:'タグ'}).click();await page.locator('.tag-cloud button').filter({hasText:'両面・カンチャン'}).click();
 await page.getByRole('button',{name:'1 問でテスト開始',exact:true}).click();await capture('03-test-question','.page--test');
 await page.locator('.hand-stage').getByRole('button',{name:'一索',exact:true}).first().click();await page.getByRole('button',{name:'回答する',exact:true}).click();await expect(page.locator('.verdict')).toHaveText('正解');await capture('03-test-answer','.page--test');
 await page.getByRole('link',{name:'学習教材',exact:true}).click();await expect(page.locator('.material-card')).toHaveCount(3);
 for(const card of await page.locator('.material-card').all())await card.scrollIntoViewIfNeeded();
 await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.material-thumbnail img')].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});setTimeout(resolve,15000)})))});
 provenance.thumbnails=await page.locator('.material-thumbnail').evaluateAll(nodes=>nodes.map(node=>{const img=node.querySelector('img');return {image:img?{src:img.currentSrc,complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight}:null,fallback:!!node.querySelector('.material-thumbnail__placeholder')}}));
 await page.evaluate(()=>scrollTo(0,0));await capture('04-materials','.material-list');
 await page.getByRole('link',{name:`${materials[0].title}の記録・コメント`,exact:true}).click();await capture('04-material-detail','.page--material-detail');
 expect(errors).toEqual([]);await writeFile(`${out}provenance.json`,JSON.stringify({...provenance,status:'pass'},null,2));console.log(JSON.stringify({status:'pass',screenshots:screenshots.length,thumbnails:provenance.thumbnails}));
}catch(error){if(page)await page.screenshot({path:`${out}failure.png`,fullPage:true});await writeFile(`${out}provenance.json`,JSON.stringify({...provenance,status:'fail',message:String(error)},null,2));throw error;}finally{await browser.close();}
