// Real editor clicks, saved arrays, reload and JSON backup; synthetic local data only.
import {chromium, expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const origin=new URL(process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5183').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw Error('Loopback fixture required');
const out=new URL('../evidence/meld-layout/behavior/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium'});
const when='2026-10-07T00:00:00.000Z';
const original={id:'legacy',title:'保存済み問題',concealed:['2z','2z'],drawn:null,melds:[],doraIndicators:['9s'],answerEnabled:true,acceptedDiscards:['2z'],explanation:'既存の解説',privateMemo:'既存のメモ',tagIds:['tag'],context:{roundWind:'1z',handNumber:1,seatWind:'2z',turn:6,honba:0,riichiSticks:0,ownRank:null,scores:{east:25000,south:25000,west:25000,north:25000}},attachments:[],sourceUrl:'',createdAt:when,updatedAt:when};
const seed={schemaVersion:1,revision:4,problems:[original],tags:[{id:'tag',name:'保持'}],study:[{problemId:'legacy',contentRevision:4,confirmationCount:3,lastConfirmedAt:when,understanding:'understood',lastReviewedAt:when,lastSolvedAt:when,lastCorrectAt:when,inTest:true}],attempts:[{id:'answer',problemId:'legacy',contentRevision:4,sessionId:'session',questionIndex:0,at:when,selectedTile:'2z',result:'correct'}],settings:{autoSort:true},daily:{'2026-10-07':{tested:1,confirmed:3}},materials:[],materialStudyEvents:[]};
const results=[];let page;
const button=name=>page.getByRole('button',{name,exact:true});
const palette=name=>page.locator('.tile-palette').getByRole('button',{name,exact:true});
const groups=()=>page.locator('.tile-input .hand-melds .meld-view');
const readStore=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')));
async function expectOrder(labels){await expect(groups()).toHaveCount(labels.length);const data=await groups().evaluateAll(groups=>groups.map(g=>({label:g.querySelector('.tile-face').getAttribute('aria-label'),x:g.getBoundingClientRect().x})));expect(data.map(g=>g.label)).toEqual(labels);expect(data.map(g=>g.x)).toEqual(data.map(g=>g.x).sort((a,b)=>a-b));}
async function add(tab,tile){await page.getByRole('tab',{name:tab,exact:true}).click();await palette(tile).click();}
async function save(){await button('保存').click();await expect(page.getByRole('heading',{name:original.title,exact:true})).toBeVisible();}
try{
for(const width of [320,390,1440]){
 const context=await browser.newContext({viewport:{width,height:width===1440?1000:844},serviceWorkers:'block'});
 await context.addInitScript(seed=>{if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(seed));},seed);
 page=await context.newPage();await page.goto(`${origin}/#/edit/legacy`);
 await expect(page.getByRole('heading',{name:'問題を編集',exact:true})).toBeVisible();
 await add('明刻子','中');await add('明刻子','九萬');await expectOrder(['九萬','中']);
 await page.locator('.tile-input .hand-stage').screenshot({path:`${out}${width}-chun-then-nine.png`});
 await page.locator('.tile-input .meld-btn').filter({has:page.getByRole('img',{name:'中',exact:true})}).click();await add('明刻子','中');await expectOrder(['中','九萬']);
 await page.locator('.tile-input .hand-stage').screenshot({path:`${out}${width}-nine-then-chun.png`});
 await button('戻す').click();await expectOrder(['九萬']);await button('戻す').click();await expectOrder(['九萬','中']);
 await add('明順子','四筒');await add('暗槓子','一索');await expectOrder(['一索','四筒','九萬','中']);
 expect(await groups().nth(1).getByRole('img').evaluateAll(ts=>ts.map(t=>t.getAttribute('aria-label')))).toEqual(['四筒','五筒','六筒']);
 await save();const before=await readStore();
 expect(before.problems[0].melds.map(m=>m.tiles[0])).toEqual(['7z','9m','4p','1s']);
 for(const key of ['concealed','drawn','doraIndicators','answerEnabled','acceptedDiscards','explanation','privateMemo','tagIds','context','attachments','sourceUrl','createdAt'])expect(before.problems[0][key]).toEqual(original[key]);
 expect(before.attempts).toEqual(seed.attempts);expect(before.tags).toEqual(seed.tags);expect(before.daily).toEqual(seed.daily);
 await page.reload();await page.getByRole('link',{name:'編集',exact:true}).click();await expectOrder(['一索','四筒','九萬','中']);
 // At four groups and a complete standard hand, upgrade adds one physical tile only.
 await page.getByRole('tab',{name:'加槓子',exact:true}).click();await button('右家').click();await expect(palette('中')).toBeEnabled();await palette('中').click();await expectOrder(['一索','四筒','九萬','中']);
 expect(await groups().last().getAttribute('aria-label')).toBe('加槓');
 await page.locator('.tile-input .hand-stage').screenshot({path:`${out}${width}-promotion-four-groups.png`});
 await button('戻す').click();expect(await groups().last().getAttribute('aria-label')).toBe('ポン');await palette('中').click();await save();
 const upgraded=await readStore();
 expect(upgraded.problems[0].melds).toEqual(before.problems[0].melds.map((m,i)=>i===0?{...m,type:'addedKan',tiles:[...m.tiles,'7z'],addedIndex:m.calledIndex}:m));
 await page.reload();await page.getByRole('link',{name:'編集',exact:true}).click();await expectOrder(['一索','四筒','九萬','中']);
 const beforeNoop=await readStore();await save();const afterNoop=await readStore();
 expect(afterNoop.study).toEqual(beforeNoop.study);expect(afterNoop.problems[0].melds).toEqual(beforeNoop.problems[0].melds);
 await page.getByRole('link',{name:'設定',exact:true}).click();await page.getByRole('tab',{name:'データ管理',exact:true}).click();
 const download=page.waitForEvent('download');await button('JSONバックアップ').click();const backup=JSON.parse(await readFile(await(await download).path(),'utf8'));expect(backup).toEqual(await readStore());
 results.push({width,status:'pass',checks:['both insertion orders','delete/readd','undo','four mixed groups','chi internal order','save/reload','in-place pon promotion at four groups','source and ID retained','four physical copies','no-op save history retained','old schema array preserved','JSON backup equality']});await context.close();
}
}catch(e){if(page&&!page.isClosed())await page.screenshot({path:`${out}failure.png`});throw e;}
finally{await writeFile(`${out}results.json`,JSON.stringify(results,null,2));await browser.close();}
