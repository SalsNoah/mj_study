// Isolated synthetic profiles; no user data or external navigation.
import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const origin=process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5189';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Local fixture only');
const out='evidence/problem-return';await mkdir(out,{recursive:true});
const {sampleId,contentVersion,...content}=JSON.parse(await readFile('src/data/fixtures/sample03-2026-10-05.3.json','utf8'));
const old={...content,id:'old',title:'保存済みの問題',tagIds:[],createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'};
const state={problemId:'old',contentRevision:0,confirmationCount:3,lastConfirmedAt:null,understanding:'unrated',lastReviewedAt:null,lastSolvedAt:null,lastCorrectAt:null,inTest:true};
const seed={schemaVersion:1,revision:1,problems:[old],study:[state],tags:[],attempts:[],daily:{},settings:{autoSort:true},materials:[],materialStudyEvents:[]};
const browser=await chromium.launch(process.env.MAHJONG_CHROMIUM_EXECUTABLE ? {executablePath:process.env.MAHJONG_CHROMIUM_EXECUTABLE} : {});const results=[];
try{for(const width of [320,390,1440]){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await context.addInitScript(s=>{if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(s));},seed);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`${origin}/#/library`);
 const data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')));
 await page.locator('input[type="search"]').fill('一致しない条件');await expect(page.locator('.problem-card')).toHaveCount(0);
 await page.getByRole('link',{name:'作成',exact:true}).click();await page.getByPlaceholder('タイトル（任意）',{exact:true}).fill('作成後に一覧へ');
 await page.locator('.tile-palette').getByRole('button',{name:'一萬',exact:true}).click();await page.locator('.hand-stage--pick').getByRole('button',{name:'一萬',exact:true}).click();
 await page.getByRole('link',{name:'学習帳',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'この画面に残る',exact:true}).click();
 await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page).toHaveURL(`${origin}/#/library`);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('input[type="search"]')).toHaveValue('');await expect(page.locator('.problem-card')).toHaveCount(2);
 const created=(await data()).problems.find(p=>p.id!=='old');expect((await data()).study.find(s=>s.problemId===created.id).confirmationCount).toBe(0);
 await page.screenshot({path:`${out}/${width}-created-in-library.png`});
 await page.locator('.problem-card').filter({hasText:created.title}).click();await page.getByRole('button',{name:'確認した（問題一覧に戻る）',exact:true}).click();await expect(page).toHaveURL(`${origin}/#/library`);await expect(page.getByRole('button',{name:'取り消す',exact:true})).toBeVisible();
 expect((await data()).study.find(s=>s.problemId===created.id).confirmationCount).toBe(1);await page.screenshot({path:`${out}/${width}-confirmed-in-library.png`});
 await page.getByRole('button',{name:'取り消す',exact:true}).click();expect((await data()).study.find(s=>s.problemId===created.id).confirmationCount).toBe(0);
 await page.locator('.problem-card').filter({hasText:old.title}).click();await page.getByRole('link',{name:'編集',exact:true}).click();await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page).toHaveURL(`${origin}/#/problems/old`);expect((await data()).study.find(s=>s.problemId==='old').confirmationCount).toBe(3);
 expect((await data()).attempts).toEqual([]);expect((await data()).materials).toEqual([]);expect((await data()).materialStudyEvents).toEqual([]);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 results.push({width,status:'pass',checks:['new save returns to visible unfiltered library','unsaved guard stays active','confirmation returns with 5-second undo','undo restores count','existing edit still returns to detail','no test or material records created']});await context.close();
}}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
