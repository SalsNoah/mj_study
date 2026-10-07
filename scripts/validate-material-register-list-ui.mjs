// Isolated local browser verification. YouTube responses are explicitly mocked.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5184';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local fixture only');
const out='evidence/material-register-list';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium'});
const when='2026-10-01T00:00:00Z';const old={id:'old',title:'保存済み教材',url:'https://example.com/old',comment:'変更しないコメント',createdAt:when,updatedAt:when};
const seed={schemaVersion:1,revision:1,problems:[],tags:[],study:[],attempts:[],settings:{autoSort:true},daily:{},materials:[old],materialStudyEvents:[]};
const results=[];
try{for(const width of [320,390,1440]){
 const context=await browser.newContext({viewport:{width,height:width===1440?900:844},serviceWorkers:'block'});await context.addInitScript(seed=>{if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(seed));},seed);
 await context.route('https://i.ytimg.com/**',r=>r.abort());let delay=0;
 await context.route('https://www.youtube.com/oembed?**',async r=>{await new Promise(resolve=>setTimeout(resolve,delay));await r.fulfill({json:{title:'自動補完の教材'}}).catch(()=>{});});
 const page=await context.newPage();await page.goto(`${origin}/#/materials`);const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')));
 const add=page.getByRole('button',{name:'教材を追加',exact:true});const input=page.getByLabel('URL',{exact:true});const title=page.getByLabel('タイトル（任意）',{exact:true});const search=page.getByRole('searchbox');
 await search.fill('該当なし');await add.click();await expect(input).toHaveAttribute('placeholder','YouTubeなどのURL');
 await input.fill(old.url);await title.fill('重複した入力');await page.getByRole('button',{name:'登録する',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(search).toHaveValue('該当なし');await expect(title).toHaveValue('重複した入力');expect((await read()).materials).toHaveLength(1);
 await input.fill('https://note.com/new');await title.fill('一覧に追加した教材');await page.locator('.material-form').screenshot({path:`${out}/${width}-placeholder.png`});
 await page.getByRole('button',{name:'登録する',exact:true}).click();await expect(page).toHaveURL(`${origin}/#/materials`);await expect(page.getByRole('heading',{name:'学習教材',exact:true})).toBeVisible();await expect(page.locator('.material-form')).toHaveCount(0);await expect(search).toHaveValue('');await expect(page.locator('.material-registration-status')).toBeFocused();await expect(page.locator('.material-card').first().getByRole('heading')).toHaveText('一覧に追加した教材');
 expect((await read()).materials.find(m=>m.id==='old')).toEqual(old);expect((await read()).materialStudyEvents).toHaveLength(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 await page.screenshot({path:`${out}/${width}-registered-list.png`,fullPage:false});
 // A fresh manual-title draft must still permit automatic completion.
 await add.click();await expect(input).toHaveValue('');await expect(title).toHaveValue('');await input.fill('https://youtu.be/M7lc1UVf-VE?si=preserved');await expect(title).toHaveValue('自動補完の教材');await title.fill('手動編集した教材');await page.getByRole('button',{name:'登録する',exact:true}).click();await expect(page).toHaveURL(`${origin}/#/materials`);await expect(page.locator('.material-card').first().getByRole('heading')).toHaveText('手動編集した教材');
 // Save during fetch, then start another form: the old result cannot fill it.
 await add.click();delay=1000;await input.fill('https://youtu.be/abcdefghijk');await page.waitForTimeout(350);await page.getByRole('button',{name:'登録する',exact:true}).click();await expect(page).toHaveURL(`${origin}/#/materials`);await add.click();await expect(title).toHaveValue('');await page.waitForTimeout(1100);await expect(title).toHaveValue('');await expect(input).toHaveValue('');await page.getByRole('button',{name:'閉じる',exact:true}).click();
 const saved=await read();expect(saved.materials).toHaveLength(4);expect(new Set(saved.materials.map(m=>m.id)).size).toBe(4);expect(saved.materialStudyEvents).toHaveLength(0);
 await page.locator('.material-card').filter({has:page.getByRole('heading',{name:'手動編集した教材',exact:true})}).locator('.material-record-link').click();await expect(page.locator('.page--material-detail h1')).toHaveText('手動編集した教材');await expect(page).not.toHaveURL(`${origin}/#/materials`);
 results.push({width,status:'pass',youtube:'mocked',checks:['exact placeholder','note URL supported','duplicate draft/filter retained','list URL unchanged after registration','new card visible','form closed and reset','success focus','search cleared only on success','manual title and next auto title','late response ignored after new draft','unique IDs','old comment retained','no study increment','explicit details link still navigates']});await context.close();
}}finally{await writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2));await browser.close();}
