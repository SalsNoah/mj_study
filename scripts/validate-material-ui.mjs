// Dedicated synthetic profiles. The only live external fetch is one verified public YouTube thumbnail.
// Synthetic image success/failure and live provider availability are reported separately.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { assertCumulativeRecordChart } from './check-record-cumulative.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const out=new URL('../evidence/material-ui/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const origin=process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5176';
const browser=await chromium.launch({headless:true});
let page;const results=[],errors=[],networkAudit=[],networkViolations=[];
const publicThumbnail='https://i.ytimg.com/vi/7lCDEYXw3mM/mqdefault.jpg';
const publicThumbnailSource='https://developers.google.com/youtube/v3/getting-started';
const syntheticImage='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#276760"/><text x="24" y="96" fill="white" font-size="22">Synthetic QA image</text></svg>';
let providerCheck={status:'not-run',url:publicThumbnail,source:publicThumbnailSource};
const empty={schemaVersion:1,revision:0,problems:[],tags:[],study:[],attempts:[],settings:{autoSort:true},daily:{}};
async function open(seed=empty,{thumbnailMode='block',label='regression'}={}){
 const ctx=await browser.newContext({viewport:{width:390,height:740},isMobile:true,hasTouch:true,locale:'ja-JP',timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await ctx.addInitScript(data=>{if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(data));},seed);
 // A dummy provider cookie makes the anonymous-credentials assertion meaningful.
 // The live-provider context has no cookies or saved sessions.
 if(thumbnailMode==='synthetic-success')await ctx.addCookies([{name:'qa-synthetic-cookie',value:'never-send',domain:'i.ytimg.com',path:'/',secure:true,sameSite:'None'}]);
 await ctx.route('**/*',async route=>{
  const request=route.request(),url=request.url(),u=new URL(url);
  if(u.origin===new URL(origin).origin||u.protocol==='data:')return route.continue();
  const headers=await request.allHeaders();
  const audit={context:label,url,type:request.resourceType(),referrer:headers.referer??null,cookie:headers.cookie??null,authorization:headers.authorization??null,action:'abort'};
  networkAudit.push(audit);
  if(request.resourceType()==='image'){
   const safe=url===publicThumbnail&&!u.search&&!u.hash&&!headers.referer&&!headers.cookie&&!headers.authorization;
   if(!safe){networkViolations.push(audit);return route.abort();}
   if(thumbnailMode==='synthetic-success'){
    audit.action='synthetic-image';
    return route.fulfill({status:200,contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*','cache-control':'no-store'},body:syntheticImage});
   }
   if(thumbnailMode==='live'){
    audit.action='verified-public-image';
    try{
     // Do not follow redirects: only this exact public resource may leave the fixture.
     const response=await route.fetch({maxRedirects:0,timeout:12000});
     const responseHeaders=response.headers();
     providerCheck={...providerCheck,status:'response-received',httpStatus:response.status(),contentType:responseHeaders['content-type']??null,allowOrigin:responseHeaders['access-control-allow-origin']??null,transport:'live-provider-bytes; redirects disabled'};
     if(response.status()>=300&&response.status()<400){providerCheck.status='provider-redirect-blocked';return route.abort();}
     return route.fulfill({response});
    }catch(error){providerCheck={...providerCheck,status:'provider-request-failed',message:String(error)};return route.abort();}
   }
  }
  if(request.resourceType()!=='image'&&request.resourceType()!=='document')networkViolations.push(audit);
  return route.abort();
 });
 page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);return ctx;
}
async function nav(name){await page.getByRole('link',{name,exact:true}).click();}
async function data(){return page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')));}
async function capture(name,selector){if(selector)await page.locator(selector).evaluate(el=>el.scrollIntoView({block:'center'}));else await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${out}${name}.png`,animations:'disabled'});const geometry=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,nav:[...document.querySelectorAll('.bottom-nav a')].map(el=>{const r=el.getBoundingClientRect();return {name:el.textContent,width:r.width,height:r.height}})}));expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width);expect(geometry.nav).toHaveLength(6);for(const r of geometry.nav){expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);}results.push({name,...geometry});}
async function sizes(name,selector){for(const width of [320,375,390,1440]){await page.setViewportSize({width,height:width===1440?900:740});await capture(`${name}-${width}`,selector);}}
async function add(url,title){await page.getByLabel('URL',{exact:true}).fill(url);await page.getByLabel('タイトル（任意）',{exact:true}).fill(title);await page.getByRole('button',{name:'登録する',exact:true}).click();await expect(page.locator('.page--material-detail h1')).toHaveText(title);}
function listSeed(){
 const timestamp='2026-10-05T00:00:00.000Z';
 const item=(id,title,url,comment='')=>({id,title,url,comment,createdAt:timestamp,updatedAt:timestamp});
 const materials=[
  item('qa-youtube','牌効率 ＡＢＣ １２３','https://www.youtube.com/watch?v=7lCDEYXw3mM&list=qa-dummy-list&si=qa-dummy-token#qa-dummy-fragment','qa-dummy-comment：両面の受入れを確認'),
  item('qa-note','守備と押し引き','https://note.com/qa-example/%E9%BA%BB%E9%9B%80?source=qa-dummy'),
  item('qa-long',('長い教材名：条件と選択理由を整理する。').repeat(5).slice(0,100),'https://'+'a'.repeat(60)+'.'+'b'.repeat(60)+'.example.com/'+'long-'.repeat(220)+'?source=qa-dummy'),
  item('qa-channel','チャンネル形式は代替サムネイル','https://www.youtube.com/@qa-example/live'),
  item('qa-spoof','似たホスト名も代替サムネイル','https://youtube.com.example.org/watch?v=7lCDEYXw3mM'),
 ];
 return {...structuredClone(empty),materials,materialStudyEvents:[0,1].map(i=>({id:`qa-event-${i}`,materialId:materials[0].id,at:timestamp,title:materials[0].title,url:materials[0].url,comment:'qa-dummy-event'}))};
}
async function listGeometry(name){
 const rows=await page.locator('.material-list > li').evaluateAll(items=>items.map(item=>{
  const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const card=item.querySelector('.material-card');
  return {row:rect(item),card:rect(card),title:rect(card.querySelector('h2')),thumbnail:rect(card.querySelector('.material-thumbnail')),actions:[...card.querySelectorAll('.material-card__actions a')].map(rect)};
 }));
 expect(rows).toHaveLength(5);
 for(const [index,row] of rows.entries()){
  if(index){expect(row.row.y).toBeGreaterThanOrEqual(rows[index-1].row.bottom);expect(Math.abs(row.row.x-rows[0].row.x)).toBeLessThan(1);expect(Math.abs(row.row.width-rows[0].row.width)).toBeLessThan(1);}
  for(const child of [row.title,row.thumbnail,...row.actions]){expect(child.x).toBeGreaterThanOrEqual(row.card.x);expect(child.right).toBeLessThanOrEqual(row.card.right+1);expect(child.bottom).toBeLessThanOrEqual(row.card.bottom+1);}
  for(const action of row.actions){expect(action.width).toBeGreaterThanOrEqual(44);expect(action.height).toBeGreaterThanOrEqual(44);}
 }
 await capture(name);await page.screenshot({path:`${out}${name}-full.png`,fullPage:true,animations:'disabled'});
 results.push({name:`${name}-one-row-per-content`,rows});
}
async function checkMaterialList(){
 const ctx=await open(listSeed(),{thumbnailMode:'synthetic-success',label:'list-synthetic-success'});
 await nav('学習教材');const before=await data(),listUrl=page.url();
 const cards=page.locator('.material-card'),video=cards.filter({has:page.getByRole('heading',{name:'牌効率 ＡＢＣ １２３',exact:true})});
 await expect(cards).toHaveCount(5);await expect(video.locator('.material-count')).toHaveText('学習 2 回');
 const thumbnail=video.locator('img');await expect(thumbnail).toHaveAttribute('src',publicThumbnail);await expect(thumbnail).toHaveAttribute('crossorigin','anonymous');await expect(thumbnail).toHaveAttribute('referrerpolicy','no-referrer');
 await expect.poll(()=>thumbnail.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 await expect(page.locator('.material-thumbnail__placeholder')).toHaveCount(4);
 for(const width of [320,375,390,1440]){await page.setViewportSize({width,height:width===1440?900:740});await listGeometry(`materials-direct-list-${width}`);}
 await page.setViewportSize({width:320,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await listGeometry('materials-direct-list-text150');await page.evaluate(()=>document.documentElement.style.fontSize='');
 const search=page.getByRole('searchbox',{name:'教材を検索',exact:true});
 await page.getByRole('button',{name:'教材を追加',exact:true}).click();await page.getByLabel('URL',{exact:true}).fill('https://example.com/qa-unsaved');await page.getByLabel('タイトル（任意）',{exact:true}).fill('qa-dummy-未保存');
 for(const [query,title] of [['abc 123','牌効率 ＡＢＣ １２３'],['ＮＯＴＥ．ＣＯＭ','守備と押し引き'],['麻雀','守備と押し引き']]){await search.fill(query);await expect(cards).toHaveCount(1);await expect(cards.locator('h2')).toHaveText(title);await expect(page.locator('.count-pill')).toHaveText('1 / 5 件');}
 await search.fill('qa-dummy-comment');await expect(cards).toHaveCount(0);await expect(page.locator('.materials-empty[role="status"]')).toHaveText('条件に合う教材はありません。');await expect(page.getByText('教材はまだありません。',{exact:true})).toHaveCount(0);await capture('materials-search-no-results');
 await page.getByRole('button',{name:'検索をクリア',exact:true}).click();await expect(search).toHaveValue('');await expect(cards).toHaveCount(5);await expect(page.locator('.count-pill')).toHaveText('5 件');await expect(page.getByLabel('URL',{exact:true})).toHaveValue('https://example.com/qa-unsaved');await expect(page.getByLabel('タイトル（任意）',{exact:true})).toHaveValue('qa-dummy-未保存');await page.getByRole('button',{name:'閉じる',exact:true}).click();
 const direct=video.locator('.material-direct-link');await expect(direct).toHaveAttribute('href',before.materials[0].url);await expect(direct).toHaveAttribute('target','_blank');await expect(direct).toHaveAttribute('rel','noopener noreferrer');
 for(const method of ['click','keyboard']){const pending=page.waitForEvent('popup');if(method==='click')await direct.click();else{await direct.focus();await direct.press('Enter');}const popup=await pending;await popup.close();expect(page.url()).toBe(listUrl);await expect(page.locator('.page--materials')).toBeVisible();expect(await data()).toEqual(before);}
 await video.locator('.material-record-link').click();await expect(page.locator('.page--material-detail h1')).toHaveText('牌効率 ＡＢＣ １２３');await expect(page.getByLabel('コメント',{exact:true})).toHaveValue(before.materials[0].comment);await expect(page.locator('.material-count')).toHaveText('学習 2 回');expect(await data()).toEqual(before);
 await page.locator('.material-back').click();await expect(cards).toHaveCount(5);await page.reload();await expect(cards).toHaveCount(5);expect(await data()).toEqual(before);
 expect(networkAudit.some(item=>item.context==='list-synthetic-success'&&item.action==='synthetic-image')).toBe(true);
 results.push({name:'materials-list-search-links-storage',status:'pass',syntheticThumbnail:'loaded',eventsUnchanged:2});await ctx.close();
 const failedCtx=await open(listSeed(),{thumbnailMode:'block',label:'list-image-failure'});await nav('学習教材');await expect(page.locator('.material-thumbnail img')).toHaveCount(0);await expect(page.locator('.material-thumbnail__placeholder')).toHaveCount(5);await expect(page.locator('.material-direct-link')).toHaveCount(5);await expect(page.locator('.material-record-link')).toHaveCount(5);await capture('materials-thumbnail-fallback');results.push({name:'materials-thumbnail-failure',status:'pass',fallbacks:5});await failedCtx.close();
}
async function checkLiveProvider(){
 const liveSeed=listSeed();liveSeed.materials=liveSeed.materials.slice(0,1);
 const ctx=await open(liveSeed,{thumbnailMode:'live',label:'live-public-provider'});await nav('学習教材');
 const card=page.locator('.material-card');await card.scrollIntoViewIfNeeded();
 try{await expect.poll(async()=>card.evaluate(el=>{const img=el.querySelector('img');return img?.complete&&img.naturalWidth>0?'loaded':el.querySelector('.material-thumbnail__placeholder')?'fallback':'pending';}),{timeout:16000}).not.toBe('pending');}catch{providerCheck={...providerCheck,status:'provider-load-timeout'};}
 const liveRequests=networkAudit.filter(item=>item.context==='live-public-provider');expect(liveRequests).toHaveLength(1);expect(liveRequests[0].action).toBe('verified-public-image');
 const rendered=await card.evaluate(el=>{const img=el.querySelector('img');return {loaded:!!(img?.complete&&img.naturalWidth>0),naturalWidth:img?.naturalWidth??0,naturalHeight:img?.naturalHeight??0,fallback:!!el.querySelector('.material-thumbnail__placeholder')};});
 const corsAllowed=providerCheck.allowOrigin==='*'||providerCheck.allowOrigin===new URL(origin).origin;
 providerCheck={...providerCheck,...rendered,corsAllowed,status:rendered.loaded&&corsAllowed?'live-thumbnail-verified':providerCheck.status==='response-received'?(providerCheck.httpStatus===200&&!corsAllowed?'provider-cors-unavailable':'provider-image-unavailable'):providerCheck.status};
 await expect(card.locator('.material-direct-link')).toBeVisible();await expect(card.locator('.material-record-link')).toBeVisible();expect((await data()).materialStudyEvents).toHaveLength(2);
 await capture('materials-live-public-thumbnail');await writeFile(`${out}thumbnail-provider.json`,JSON.stringify(providerCheck,null,2));await ctx.close();
}

try{
 const ctx=await open();await nav('学習教材');await expect(page.getByText('教材はまだありません。',{exact:true})).toBeVisible();await sizes('materials-empty');
 await page.getByLabel('URL',{exact:true}).fill('javascript:alert(1)');await page.getByRole('button',{name:'登録する',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();expect((await data()).materials??[]).toHaveLength(0);
 await add('https://example.com/lesson-a','牌効率の動画を振り返る');await expect(page.locator('.material-count')).toContainText('0 回');await sizes('material-new');
 const link=page.locator('.material-open');await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');const pending=page.waitForEvent('popup');await link.click();const external=await pending;await external.close();expect((await data()).materialStudyEvents??[]).toHaveLength(0);
 await page.getByLabel('コメント',{exact:true}).fill('両面とカンチャンの違い\n次は押し引きも見返す');await page.getByRole('button',{name:'コメントを保存',exact:true}).click();await expect(page.locator('.material-count')).toContainText('0 回');await page.reload();await expect(page.getByLabel('コメント',{exact:true})).toHaveValue('両面とカンチャンの違い\n次は押し引きも見返す');
 await page.locator('.material-edit > summary').click();await page.getByLabel('タイトル',{exact:true}).fill('牌効率の動画を振り返る（復習用）');await page.getByRole('button',{name:'教材情報を保存',exact:true}).focus();await page.getByRole('button',{name:'教材情報を保存',exact:true}).press('Enter');await expect(page.locator('.material-edit > summary')).toBeFocused();
 await page.getByRole('button',{name:'学習した',exact:true}).click();await expect(page.locator('.material-count')).toContainText('1 回');await expect(page.getByRole('button',{name:'学習した',exact:true})).toBeDisabled();expect((await data()).materialStudyEvents).toHaveLength(1);await sizes('material-studied','.material-study');for(const theme of ['cool','cute']){await page.setViewportSize({width:375,height:740});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await capture(`material-studied-${theme}`,'.material-study');}await page.evaluate(()=>document.documentElement.dataset.theme='');await capture('material-history','.material-history');
 await nav('記録帳');await expect(page.locator('.stat-grid strong')).toHaveText(['0','0','0','0']);await expect(page.locator('.records-title__total strong').nth(0)).toContainText('0');await expect(page.locator('.records-title__total strong').nth(1)).toContainText('1');await expect(page.locator('.records-material-history')).toContainText('両面とカンチャンの違い');await capture('material-recorded-history','.records-material-history');
 await nav('学習教材');await page.locator('.material-record-link').click();await page.getByRole('button',{name:'直前の学習を取り消す',exact:true}).click();await expect(page.locator('.material-count')).toContainText('0 回');expect((await data()).materialStudyEvents).toHaveLength(0);await nav('記録帳');await expect(page.locator('.records-title__total strong').nth(1)).toContainText('0');await expect(page.locator('.records-material-history__entry')).toHaveCount(0);
 await nav('学習教材');await page.getByRole('button',{name:'教材を追加',exact:true}).click();await page.getByLabel('URL',{exact:true}).fill('https://EXAMPLE.COM:443/lesson-a');await page.getByRole('button',{name:'登録する',exact:true}).click();await expect(page.getByRole('link',{name:'登録済みの教材を開く',exact:true})).toBeVisible();expect((await data()).materials).toHaveLength(1);await sizes('material-duplicate');
 await page.getByLabel('URL',{exact:true}).fill('https://example.com/lesson-b');await page.getByLabel('タイトル（任意）',{exact:true}).fill('長いタイトルでも読みやすい学習教材：手牌の条件を整理して選択理由を考える');await page.getByRole('button',{name:'登録する',exact:true}).click();await page.getByLabel('コメント',{exact:true}).fill('今回の確認ポイントをコメントに残す');await page.getByRole('button',{name:'学習した',exact:true}).click();await page.getByRole('button',{name:'次の学習を記録する',exact:true}).focus();await page.getByRole('button',{name:'次の学習を記録する',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'学習した',exact:true})).toBeFocused();expect((await data()).materialStudyEvents).toHaveLength(1);await page.getByRole('button',{name:'学習した',exact:true}).click();expect((await data()).materialStudyEvents).toHaveLength(2);await sizes('material-long-title');
 await page.setViewportSize({width:375,height:480});await page.getByLabel('コメント',{exact:true}).click();await capture('material-short-comment','.material-study');await page.setViewportSize({width:320,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await capture('material-text150','.material-study');await page.evaluate(()=>document.documentElement.style.fontSize='');
 await nav('学習教材');await sizes('materials-list');const saved=await data();expect(saved.problems).toHaveLength(0);expect(saved.attempts).toHaveLength(0);expect(saved.daily).toEqual({});await page.reload();await expect(page.locator('.material-card')).toHaveCount(2);
 await nav('設定');await page.getByRole('tab',{name:'データ管理',exact:true}).click();await page.getByRole('button',{name:'JSON復元…',exact:true}).click();await page.locator('input[type="file"]').setInputFiles({name:'materials-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await expect(page.locator('.import-preview')).toContainText('教材 2 件 / 教材の学習記録 2 件');await capture('materials-backup-preview','.import-preview');await page.locator('.import-preview').getByRole('button',{name:'追加',exact:true}).click();expect((await data()).materials).toHaveLength(2);expect((await data()).materialStudyEvents).toHaveLength(2);await ctx.close();
 const historic=structuredClone(saved);const now=new Date();historic.daily={};historic.materialStudyEvents=[];for(let i=0;i<150;i++){const date=new Date(now);date.setDate(date.getDate()-i*2);date.setHours(12,0,0,0);historic.materialStudyEvents.push({id:`material-event-${i}`,materialId:historic.materials[i%2].id,at:date.toISOString(),title:historic.materials[i%2].title,url:historic.materials[i%2].url,comment:`復習${i+1}回目：判断の根拠を確認`});historic.daily[date.toISOString().slice(0,10)]={tested:i%3,confirmed:i%2};}
 const historyContext=await open(historic);await nav('記録帳');for(const [label,id,rows] of [['日別','daily',14],['週別','weekly',12],['月別','monthly',12]]){await page.getByRole('tab',{name:label,exact:true}).click();const panel=page.locator(`#records-view-panel-${id}`);await expect(panel.locator('polyline')).toHaveCount(3);await expect(panel.locator('tbody tr')).toHaveCount(rows);const totals=['tested','confirmed'].map(field=>Object.values(historic.daily).reduce((sum,day)=>sum+day[field],0));const cumulative=await assertCumulativeRecordChart(panel,[...totals,150]);expect(cumulative.first[2]).toBeGreaterThanOrEqual(0);results.push({name:`material-records-${id}-cumulative`,...cumulative});await sizes(`material-records-${id}`,'.records-history');await panel.locator('summary').click();await capture(`material-records-${id}-values`,'.records-values[open]:visible');}
 await sizes('material-separate-titles','.records-titles');await sizes('material-records-history','.records-material-history');await page.setViewportSize({width:320,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await capture('material-records-titles-text150','.records-titles');await capture('material-records-values-text150','.records-values[open]:visible');await page.evaluate(()=>document.documentElement.style.fontSize='');expect((await data()).materialStudyEvents).toHaveLength(150);await historyContext.close();
 await checkMaterialList();await checkLiveProvider();expect(networkViolations).toEqual([]);expect(errors).toEqual([]);await writeFile(`${out}material-results.json`,JSON.stringify({status:'pass',results,errors,networkAudit,networkViolations,providerCheck},null,2));console.log(JSON.stringify({status:'pass',records:results.length,errors,liveThumbnail:providerCheck.status}));
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:`${out}failure.png`,animations:'disabled'});await writeFile(`${out}material-results.json`,JSON.stringify({status:'fail',message:String(error),results,errors,networkAudit,networkViolations,providerCheck},null,2));throw error;}finally{await browser.close();}
