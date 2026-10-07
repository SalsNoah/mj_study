// Real local browser actions on synthetic data, external images deliberately fail.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5174';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local fixture only');
const out='evidence/material-actions';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium'});
const when='2026-10-01T00:00:00Z';const materials=[0,1,2].map(i=>({id:`qa-${i}`,title:`${i}：麻雀の基本を学ぶ教材・長いタイトルでも情報を保つ練習`.repeat(2),url:`https://youtu.be/${['M7lc1UVf-VE','abcdefghijk','0123456789a'][i]}`,comment:'保存済みコメントを残す。'.repeat(20),createdAt:when,updatedAt:`2026-10-0${3-i}T00:00:00Z`}));
const seed={schemaVersion:1,revision:1,problems:[],tags:[],study:[],attempts:[],settings:{autoSort:true},daily:{},materials,materialStudyEvents:[]};
const results=[];
try{for(const width of [320,390,1440])for(const theme of ['normal','cool','cute','dopa','moe']){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
 await context.addInitScript(({seed,theme})=>{if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(seed));localStorage.setItem('mahjong-study:theme',theme);},{seed,theme});
 await context.route('https://i.ytimg.com/**',r=>r.abort());await context.route('https://youtu.be/**',r=>r.abort());const page=await context.newPage();await page.goto(`${origin}/#/materials`);const cards=page.locator('.material-card');await expect(cards).toHaveCount(3);const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')));
 await page.evaluate(()=>document.fonts.ready);
 for(const scale of [100,150]){
  await page.evaluate(scale=>document.documentElement.style.fontSize=`${scale}%`,scale);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  const sizes=await cards.first().locator('.material-card__actions a,.material-card__actions button').evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}}));expect(sizes).toHaveLength(4);for(const b of sizes){expect(b.h).toBeGreaterThanOrEqual(44);expect(b.w).toBeGreaterThanOrEqual(44)}
  for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){const a=sizes[i],b=sizes[j];expect(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y).toBeTruthy()}
  await page.screenshot({path:`${out}/${width}-${theme}-${scale}.png`,fullPage:true});
 }
 await page.evaluate(()=>document.documentElement.style.fontSize='100%');
 // DOM/tab order follows the two visual rows. External opening has no recording side effect.
 const actions=cards.last().locator('.material-card__actions a,.material-card__actions button');await actions.nth(0).focus();await page.keyboard.press('Tab');await expect(actions.nth(1)).toBeFocused();await page.keyboard.press('Tab');await expect(actions.nth(2)).toBeFocused();await page.keyboard.press('Tab');await expect(actions.nth(3)).toBeFocused();
 await actions.nth(0).focus();await actions.nth(2).hover();await cards.last().screenshot({path:`${out}/${width}-${theme}-focus-hover.png`});
 const popupPromise=context.waitForEvent('page');await actions.nth(0).click();const popup=await popupPromise;await popup.close();expect((await read()).materialStudyEvents).toHaveLength(0);
 const before=(await read()).materials;const titles=await cards.locator('h2').allTextContents();
 await cards.last().locator('.material-study-action').dblclick();expect((await read()).materialStudyEvents).toHaveLength(1);expect(await cards.locator('h2').allTextContents()).toEqual(titles);expect((await read()).materials.find(m=>m.id==='qa-2').comment).toBe(before[2].comment);expect(page.url()).toContain('#/materials');
 await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(cards.last().locator('.material-study-action')).toBeFocused();
 await cards.last().locator('.material-study-action').press('Enter');await page.getByRole('button',{name:'もう1回記録する',exact:true}).click();expect((await read()).materialStudyEvents).toHaveLength(2);
 const archive=cards.last().locator('.material-archive-action');await archive.press('Space');await page.keyboard.press('Escape');await expect(archive).toBeFocused();expect((await read()).materials.every(m=>!m.archivedAt)).toBeTruthy();
 await archive.click();await page.getByRole('button',{name:'アーカイブする',exact:true}).click();await expect(cards).toHaveCount(2);await expect(page.getByRole('searchbox')).toBeFocused();let stored=await read();expect(stored.materialStudyEvents).toHaveLength(2);expect(stored.materials.find(m=>m.id==='qa-2').comment).toBe(before[2].comment);
 await page.getByRole('button',{name:'アーカイブ 1 件',exact:true}).click();await expect(cards).toHaveCount(1);await expect(cards.locator('.material-study-action')).toBeDisabled();await page.screenshot({path:`${out}/${width}-${theme}-archived.png`,fullPage:true});await cards.locator('.material-archive-action').click();await expect(cards).toHaveCount(0);await expect(page.getByRole('searchbox')).toBeFocused();expect((await read()).materialStudyEvents).toHaveLength(2);
 results.push({width,theme,status:'pass',checks:['100/150% text','failed image','long title/comment','four 44px actions no overlap','tab order','doubleclick one event stable card order','repeat confirmation','comment preserved','archive cancel/confirm','focus','restore','history retained']});await context.close();
}}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
