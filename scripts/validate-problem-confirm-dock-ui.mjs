// Chromium layout coverage; safe-area and keyboard constraints are simulated, not real iOS UI.
import {chromium,expect} from '@playwright/test';import{readFile,writeFile,mkdir}from'node:fs/promises';
const origin=process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5189';if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Local fixture only');
const out='evidence/problem-confirm-dock';await mkdir(out,{recursive:true});
const {sampleId,contentVersion,...content}=JSON.parse(await readFile('src/data/fixtures/sample03-2026-10-05.3.json','utf8'));
const seed={schemaVersion:1,revision:1,problems:[{...content,id:'dock',title:'確認ボタンの配置確認',tagIds:[],privateMemo:'長いメモ\n'.repeat(30),createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'}],tags:[],study:[{problemId:'dock',contentRevision:0,confirmationCount:0,lastConfirmedAt:null,understanding:'unrated',lastReviewedAt:null,lastSolvedAt:null,lastCorrectAt:null}],attempts:[],daily:{},settings:{autoSort:true}};
const browser=await chromium.launch(process.env.MAHJONG_CHROMIUM_EXECUTABLE ? {executablePath:process.env.MAHJONG_CHROMIUM_EXECUTABLE} : {});const results=[];
try{for(const width of [320,390,844,1440]){
 const height=width===844?390:900;const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('mahjong-study:v1',JSON.stringify(s)),seed);const page=await context.newPage();await page.goto(`${origin}/#/problems/dock`);
 const button=page.getByRole('button',{name:'確認した（問題一覧に戻る）',exact:true});await expect(button).toHaveCount(1);await expect(button).toBeVisible();
 const metric=()=>page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};return{nav:rect('.bottom-nav'),dock:rect('.detail-confirm-dock'),button:rect('.detail-confirm-dock button'),last:rect('.detail-tools'),position:getComputedStyle(document.querySelector('.detail-confirm-dock')).position,scrollWidth:document.documentElement.scrollWidth,height:innerHeight};});
 for(const scenario of ['normal','large-safe','dopa','moe']){
  await page.evaluate(mode=>{document.documentElement.style.fontSize=mode==='large-safe'?'32px':'';document.documentElement.style.setProperty('--safe-bottom',mode==='large-safe'?'34px':'0px');document.documentElement.dataset.theme=['dopa','moe'].includes(mode)?mode:'normal';},scenario);
  if(await page.getByRole('button',{name:'正解・解説を表示',exact:true}).count())await page.getByRole('button',{name:'正解・解説を表示',exact:true}).click();await page.locator('.detail-tools').evaluate(e=>e.open=true);await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(120);
  const m=await metric();expect(m.scrollWidth).toBe(width);expect(m.button.height).toBeGreaterThanOrEqual(44);
  if(width<1100){expect(m.position).toBe('fixed');expect(Math.abs(m.dock.bottom-m.nav.y)).toBeLessThan(1);expect(m.last.bottom).toBeLessThanOrEqual(m.dock.y);expect(m.nav.bottom).toBe(height);await expect(button).toBeInViewport();}
  else{expect(m.position).toBe('static');expect(m.nav.y).toBe(8);}
  if(width>=1100){await page.evaluate(()=>scrollTo(0,0));await button.scrollIntoViewIfNeeded();}
  await page.screenshot({path:`${out}/${width}-${scenario}.png`});results.push({width,scenario,status:'pass',geometry:m});
 }
 await page.evaluate(()=>{document.documentElement.style.fontSize='';document.documentElement.style.setProperty('--safe-bottom','0px');document.documentElement.dataset.theme='normal';});
 if(width<1100){
  await page.getByRole('tab',{name:'受入れ',exact:true}).click();await page.locator('.remaining-toggle').click();await page.locator('.remaining-tile').first().click();const input=page.locator('.remaining-control input').first();await input.focus();await page.setViewportSize({width,height:Math.min(height,360)});await input.scrollIntoViewIfNeeded();await page.waitForTimeout(120);
  const m=await metric(),r=await input.boundingBox();expect(r.y+r.height).toBeLessThanOrEqual(m.dock.y);expect(Math.abs(m.dock.bottom-m.nav.y)).toBeLessThan(1);await page.screenshot({path:`${out}/${width}-keyboard-constraint.png`});results.push({width,scenario:'focused input + reduced viewport (simulated keyboard)',status:'pass',geometry:m});await page.setViewportSize({width,height});
 }
 await button.click();await expect(page).toHaveURL(`${origin}/#/library`);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')).study[0].confirmationCount)).toBe(1);await expect(page.locator('.detail-confirm-dock')).toHaveCount(0);await context.close();
}}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
