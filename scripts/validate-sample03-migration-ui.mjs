// Isolated profiles seeded from an actual old application catalog snapshot.
import {chromium,expect} from '@playwright/test';import{readFile,writeFile,mkdir}from'node:fs/promises';
const origin=process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5184';if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local fixture only');
const out='evidence/sample03-retirement';await mkdir(out,{recursive:true});const source=JSON.parse(await readFile('src/data/fixtures/sample03-prior-catalog-storage.json','utf8'));const KEY='mahjong-study:v1';const browser=await chromium.launch({executablePath:'/usr/bin/chromium'});const results=[];
try{for(const width of [320,390,1440])for(const scenario of ['original','edited','deleted']){
 const dump=structuredClone(source),before=JSON.parse(dump[KEY]),old=before.problems.find(p=>p.sample.itemId==='sample-v2-03');
 if(scenario==='edited')old.privateMemo='本人が追記したメモを保護';if(scenario==='deleted')before.problems=before.problems.filter(p=>p.id!==old.id);
 before.attempts=[{id:'historical-answer',problemId:old.id,contentRevision:0,sessionId:'old',questionIndex:0,at:'2026-10-01T00:00:00Z',result:'correct',selectedTile:'4s'}];before.daily={'2026-10-01':{tested:1,confirmed:2}};before.study.find(s=>s.problemId===old.id).confirmationCount=2;dump[KEY]=JSON.stringify(before);
 const context=await browser.newContext({viewport:{width,height:width===1440?900:844},serviceWorkers:'block'});await context.addInitScript(d=>{if(!localStorage.getItem('mahjong-study:v1'))for(const[k,v]of Object.entries(d))localStorage.setItem(k,v)},dump);const page=await context.newPage();await page.goto(`${origin}/#/library`);await expect(page.getByRole('button',{name:'サンプル管理',exact:true})).toBeVisible();
 const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')));const after=await read();expect(after.problems).toHaveLength(before.problems.length-(scenario==='original'?1:0));expect(after.study).toEqual(before.study);expect(after.attempts).toEqual(before.attempts);expect(after.daily).toEqual(before.daily);expect(after.problems.filter(p=>p.id!==old.id)).toEqual(before.problems.filter(p=>p.id!==old.id));
 const current=after.problems.find(p=>p.id===old.id);
 if(scenario==='original'){
  expect(current).toBeUndefined();
  await page.getByRole('button',{name:'サンプル管理',exact:true}).click();
  await expect(page.getByRole('button',{name:'サンプル1題を追加',exact:true})).toBeEnabled();
  await page.locator('.sample-backups > summary').click();
  const backup=page.locator('.sample-backup').filter({hasText:'1題を削除・0題を追加'});
  await expect(backup).toBeVisible();await page.screenshot({path:`${out}/${width}-retired-with-backup.png`,fullPage:false});
  await backup.getByRole('button',{name:'更新前の問題を復元',exact:true}).click();
  const restored=await read(),restoredOld=restored.problems.find(p=>p.id===old.id);
  expect({...restoredOld,sample:old.sample}).toEqual(old);expect(restored.study).toEqual(before.study);expect(restored.attempts).toEqual(before.attempts);
  await expect(page.getByRole('button',{name:'この10題は追加済み',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'サンプルを閉じる',exact:true}).click();
  await page.locator('.problem-card').filter({hasText:restoredOld.title}).click();await page.getByRole('button',{name:'正解・解説を表示',exact:true}).click();await expect(page.getByText(restoredOld.explanation,{exact:true})).toBeVisible();await page.screenshot({path:`${out}/${width}-restored-original.png`,fullPage:false});
 }else if(scenario==='edited'){expect(current).toEqual(old);await page.getByRole('button',{name:'サンプル管理',exact:true}).click();await expect(page.getByRole('button',{name:'この10題は追加済み',exact:true})).toBeDisabled();await expect(page.getByText('編集したサンプル 1 題はそのまま残します。',{exact:true})).toBeVisible();await page.screenshot({path:`${out}/${width}-edited-protected.png`,fullPage:false});}
 else expect(current).toBeUndefined();
 const saved=await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'));await page.reload();await expect(page.locator('.bottom-nav')).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'))).toBe(saved);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 results.push({width,scenario,status:'pass',id:old.id,checks:['only eligible old 03 removed','other nine untouched','historical 4s result preserved','daily unchanged','reload no second write',scenario==='original'?'verified backup; explicit restore preserves ID and timestamps; no repeated deletion':scenario==='edited'?'edited content protected; no duplicate addition':'deleted problem not resurrected']});await context.close();
}}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
