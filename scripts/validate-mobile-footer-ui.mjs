// Chromium geometry/gesture regression only: not a real iOS Safari rubber-band test.
import {chromium,expect} from '@playwright/test';import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5184';if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local fixture only');
const out='evidence/mobile-footer';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});const results=[];
const t='2026-10-01T00:00:00Z';const seed={schemaVersion:1,revision:1,problems:[],tags:[],study:[],attempts:[],settings:{autoSort:true},daily:{},materials:Array.from({length:8},(_,i)=>({id:`m${i}`,title:`教材 ${i+1}`,url:`https://example.com/${i}`,comment:'保存内容を変更しない',createdAt:t,updatedAt:t})),materialStudyEvents:[]};
try{for(const width of [320,390,844,1440]){
 const height=width===844?390:width===1440?900:844;
 const ctx=await browser.newContext({viewport:{width,height},isMobile:width<1100,hasTouch:width<1100,deviceScaleFactor:1,serviceWorkers:'block'});
 await ctx.addInitScript(seed=>{if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(seed));},seed);
 const page=await ctx.newPage();await page.goto(`${origin}/#/materials`);const cdp=await ctx.newCDPSession(page);
 const saved=await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'));
 const metric=()=>page.evaluate(()=>{const n=document.querySelector('.bottom-nav');const r=n.getBoundingClientRect();return {scrollingElement:document.scrollingElement.tagName,scrollY,viewport:innerHeight,visualHeight:visualViewport.height,navTop:r.top,navBottom:r.bottom,overscroll:getComputedStyle(document.documentElement).overscrollBehaviorY,safe:getComputedStyle(n).paddingBottom,width:document.documentElement.scrollWidth};});
 for(const phase of ['before','after']){
  const override=phase==='before'?await page.addStyleTag({content:'html,body{overscroll-behavior-y:auto!important}'}):null;
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(100);
  const initial=await metric();expect(initial.overscroll).toBe(phase==='after'&&width<1100?'none':'auto');
  if(width<1100){for(let i=0;i<3;i++)await cdp.send('Input.synthesizeScrollGesture',{x:Math.min(180,width/2),y:height/2,yDistance:-500,gestureSourceType:'touch',speed:1000});}
  else await page.mouse.wheel(0,3000);
  const pulled=await metric();expect(pulled.width).toBe(width);if(width<1100)expect(Math.abs(pulled.navBottom-pulled.viewport)).toBeLessThan(1);else expect(pulled.navTop).toBe(8);
  await page.screenshot({path:`${out}/${width}-${phase}-bottom.png`});results.push({width,phase,initial,pulled,scope:'Chromium synthetic gestures; native iOS bounce not reproduced'});
  if(override)await override.evaluate(e=>e.remove());
 }
 // Safe-area arithmetic and reduced viewport simulate layout constraints, not OS UI.
 if(width<1100){
  await page.addStyleTag({content:':root{--safe-bottom:34px}'});await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await expect(page.locator('.material-card').last().locator('.material-record-link')).toBeInViewport();
  const safe=await metric();expect(safe.safe).toBe('42px');const last=await page.locator('.material-card').last().boundingBox();expect(last.y+last.height).toBeLessThanOrEqual(safe.navTop);
  await page.setViewportSize({width:height,height:width});await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));expect(Math.abs((await metric()).navBottom-width)).toBeLessThan(1);
  await page.setViewportSize({width,height});await page.getByRole('button',{name:'教材を追加',exact:true}).click();await page.getByLabel('URL',{exact:true}).focus();await page.setViewportSize({width,height:Math.min(400,height)});await page.getByLabel('URL',{exact:true}).scrollIntoViewIfNeeded();await expect(page.getByLabel('URL',{exact:true})).toBeInViewport();
  await page.screenshot({path:`${out}/${width}-reduced-viewport-input.png`});await page.getByRole('button',{name:'閉じる',exact:true}).click();await page.setViewportSize({width,height});
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'display-mode',value:'standalone'}]});await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));results.push({width,scenario:'standalone CSS media + 34px simulated safe area; no installed PWA or real keyboard',standalone:await page.evaluate(()=>matchMedia('(display-mode: standalone)').matches),geometry:await metric()});
 }
 expect(await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'))).toBe(saved);
 // Actual editor route and its last reference section still scroll above navigation.
 await page.locator('.bottom-nav').getByRole('link',{name:'作成',exact:true}).click();await expect(page.locator('.page--editor')).toBeVisible();await page.waitForTimeout(200);await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(100);await page.getByText('参考資料',{exact:true}).scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));const reference=await page.getByText('参考資料',{exact:true}).boundingBox();if(width<1100)expect(reference.y+reference.height).toBeLessThanOrEqual((await metric()).navTop);await page.screenshot({path:`${out}/${width}-editor-bottom.png`});
 results.push({width,scenario:'editor bottom',geometry:await metric()});await ctx.close();
}}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
