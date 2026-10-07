// Supplemental real viewport evidence: wheel to the last card above the fixed nav.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5184';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local fixture only');
const out='evidence/material-actions-viewport';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium'});
const when='2026-10-01T00:00:00Z';const materials=[0,1,2].map(i=>({id:`qa-${i}`,title:`${i}：麻雀の基本を学ぶ教材・長いタイトルでも情報を保つ練習`.repeat(2),url:`https://youtu.be/${['M7lc1UVf-VE','abcdefghijk','0123456789a'][i]}`,comment:'保存済みコメントを残す。'.repeat(20),createdAt:when,updatedAt:`2026-10-0${3-i}T00:00:00Z`}));
const seed={schemaVersion:1,revision:1,problems:[],tags:[],study:[],attempts:[],settings:{autoSort:true},daily:{},materials,materialStudyEvents:[]};
const results=[];
try{for(const [width,scale] of [[320,150],[390,100],[1440,100]])for(const theme of ['normal','cool','cute','dopa','moe']){
 const context=await browser.newContext({viewport:{width,height:width===1440?900:844},serviceWorkers:'block'});
 await context.addInitScript(({seed,theme})=>{localStorage.setItem('mahjong-study:v1',JSON.stringify(seed));localStorage.setItem('mahjong-study:theme',theme);},{seed,theme});await context.route('https://i.ytimg.com/**',r=>r.abort());
 const page=await context.newPage();await page.goto(`${origin}/#/materials`);await page.evaluate(scale=>document.documentElement.style.fontSize=`${scale}%`,scale);await page.evaluate(()=>document.fonts.ready);
 await page.mouse.move(width/2,400);await page.mouse.wheel(0,10000);await page.waitForTimeout(300);
 const last=page.locator('.material-card').last();const bounds=await last.locator('.material-card__actions a,.material-card__actions button').evaluateAll(items=>{const nav=document.querySelector('.bottom-nav').getBoundingClientRect();return items.map(el=>{const r=el.getBoundingClientRect();return{label:el.textContent.trim(),top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,navTop:nav.top,navBottom:nav.bottom,viewportHeight:innerHeight,hit:el.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2))}})});
 for(const b of bounds){expect(b.top).toBeGreaterThanOrEqual(0);expect(b.bottom).toBeLessThanOrEqual(b.viewportHeight);expect(b.hit).toBe(true);if(width<700)expect(b.bottom).toBeLessThanOrEqual(b.navTop);}
 const name=`${width}-${theme}-${scale}-bottom-viewport`;await page.screenshot({path:`${out}/${name}.png`,fullPage:false});
 await last.locator('.material-study-action').click();await expect(last.locator('.material-count')).toContainText('1 回');
 await last.locator('.material-archive-action').click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'キャンセル',exact:true}).click();await last.locator('.material-record-link').click();await expect(page.locator('.page--material-detail')).toBeVisible();
 results.push({name,status:'pass',bounds,checks:['wheel to document bottom','all four visible above fixed nav','hit testing all four','study click records once','archive opens and cancels','details link reachable']});await context.close();
}}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
