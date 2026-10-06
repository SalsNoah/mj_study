// Legacy-format compatibility through the built app. Synthetic local profiles only.
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const origin = new URL(process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5183').origin;
if (!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname)) throw new Error('Loopback fixture required');
const out = new URL('../evidence/legacy-hand/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const revision={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim()};
const when='2026-10-01T03:00:00.000Z';
const concealed=['7z','3m','2p','4s','1s','2m','1p','5s','3s','1m','3p','2s','7z'];
const original={id:'legacy-red',title:'旧形式の赤牌を含む問題',concealed,drawn:'0s',melds:[],doraIndicators:['5s'],answerEnabled:true,acceptedDiscards:['0s'],explanation:'赤五索を選ぶ練習',privateMemo:'保存された補足',tagIds:['legacy-tag'],context:{roundWind:'1z',handNumber:1,seatWind:'2z',turn:6,honba:0,riichiSticks:0,ownRank:null,scores:{east:25000,south:25000,west:25000,north:25000}},attachments:[],sourceUrl:'',createdAt:when,updatedAt:when};
const seed=(understanding)=>({schemaVersion:1,revision:4,problems:[original],tags:[{id:'legacy-tag',name:'旧問題'}],study:[{problemId:original.id,contentRevision:4,confirmationCount:3,lastConfirmedAt:when,understanding,lastReviewedAt:when,lastSolvedAt:when,lastCorrectAt:when,inTest:true}],attempts:[{id:'legacy-answer',problemId:original.id,contentRevision:4,sessionId:'legacy-session',questionIndex:0,at:when,selectedTile:'0s',result:'correct'}],settings:{autoSort:true},daily:{'2026-10-01':{tested:1,confirmed:3}},materials:[],materialStudyEvents:[]});
const browser=await chromium.launch({headless:true});const results=[],errors=[];let page;
const readStore=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')));
async function capture(name){await page.evaluate(()=>document.fonts.ready);const geometry=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth}));expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width);await page.screenshot({path:`${out}${name}.png`,animations:'disabled'});results.push({name,...geometry});}
async function checkRecord(label){await page.getByRole('tab',{name:'記録',exact:true}).click();const panel=page.locator('#detail-view-panel-record');await expect(panel).toContainText(label);await expect(panel).toContainText('100%（1/1）');await expect(panel).toContainText('3回');}
async function save(title){await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();}
try{
 for(const [width,scale] of [[320,150],[390,100],[1440,100]]) for(const understanding of ['understood','uncertain']){
  const data=seed(understanding),label=understanding==='understood'?'理解できた':'まだ不安';
  const context=await browser.newContext({viewport:{width,height:width===1440?900:844},serviceWorkers:'block'});
  await context.addInitScript(data=>{if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(data));},data);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${origin}/#/edit/${original.id}`);await expect(page.getByRole('heading',{name:'問題を編集',exact:true})).toBeVisible();
  await page.evaluate(scale=>document.documentElement.style.fontSize=`${scale}%`,scale);
  expect(await readStore()).toEqual(data); // Rendering the legacy problem alone does not migrate it.
  await expect(page.locator('.hand-stage--pick').getByRole('button',{name:'赤五索',exact:true})).toHaveAttribute('aria-pressed','true');
  const title=`タイトルだけ変更 ${understanding}`;await page.getByRole('textbox',{name:'タイトル（任意）',exact:true}).fill(title);await save(title);
  const changed=await readStore();expect(changed.study).toEqual(data.study);expect(changed.attempts).toEqual(data.attempts);expect(changed.daily).toEqual(data.daily);expect(changed.tags).toEqual(data.tags);
  const saved=changed.problems[0];expect(saved.id).toBe(original.id);expect(saved.createdAt).toBe(original.createdAt);expect(saved.drawn).toBe(null);expect([...saved.concealed].sort()).toEqual([...concealed,'0s'].sort());
  for(const key of ['melds','doraIndicators','answerEnabled','acceptedDiscards','explanation','privateMemo','tagIds','context','attachments','sourceUrl'])expect(saved[key]).toEqual(original[key]);
  await checkRecord(label);await capture(`title-preserves-record-${width}-${scale}-${understanding}`);
  await page.reload();await page.evaluate(scale=>document.documentElement.style.fontSize=`${scale}%`,scale);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();expect((await readStore()).study).toEqual(data.study);await checkRecord(label);
  await page.getByRole('link',{name:'編集',exact:true}).click();await expect(page.getByRole('heading',{name:'問題を編集',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'自分のメモ',exact:true}).fill('補足だけの変更');await save(title);expect((await readStore()).study).toEqual(data.study);expect((await readStore()).attempts).toEqual(data.attempts);
  await page.getByRole('link',{name:'設定',exact:true}).click();await page.getByRole('tab',{name:'データ管理',exact:true}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'JSONバックアップ',exact:true}).click();const backup=JSON.parse(await readFile(await(await download).path(),'utf8'));expect(backup).toEqual(await readStore());expect(backup.study).toEqual(data.study);
  await page.getByRole('link',{name:'学習帳',exact:true}).click();await page.locator('.problem-card').filter({hasText:title}).click();await page.getByRole('link',{name:'編集',exact:true}).click();
  await page.getByRole('textbox',{name:'解説',exact:true}).fill('条件を変えた新しい解説');await save(title);
  const revised=await readStore();expect(revised.study[0]).toEqual({...data.study[0],contentRevision:5,understanding:'unrated',lastReviewedAt:null});expect(revised.attempts).toEqual(data.attempts);expect(revised.daily).toEqual(data.daily);
  await page.getByRole('tab',{name:'記録',exact:true}).click();await expect(page.locator('#detail-view-panel-record')).toContainText('未評価');await expect(page.locator('#detail-view-panel-record')).not.toContainText('100%');await capture(`real-content-revises-record-${width}-${scale}-${understanding}`);
  results.push({name:`save-reload-backup-real-change-${width}-${scale}-${understanding}`,status:'pass',titleRevision:changed.study[0].contentRevision,realRevision:revised.study[0].contentRevision,historyUnchanged:true});await context.close();
 }
 expect(errors).toEqual([]);
}catch(error){errors.push(error.stack??String(error));if(page&&!page.isClosed())await page.screenshot({path:`${out}failure.png`,animations:'disabled'}).catch(()=>{});throw error;}
finally{await writeFile(`${out}results.json`,JSON.stringify({revision,results,errors},null,2));await browser.close();}
