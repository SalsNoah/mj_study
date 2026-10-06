// Synthetic study data only. Local artwork; no external URLs or user records.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { discardFixtureDraft } from './editor-ui-helpers.mjs';
const revision={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim()};
const out = new URL('../evidence/moe-motion/', import.meta.url).pathname;
await mkdir(out, {recursive:true});
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176';
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({viewport:{width:390,height:667},serviceWorkers:'block'});
const seed={schemaVersion:1,revision:0,problems:[],tags:[],study:[],attempts:[],settings:{autoSort:true},daily:{},materials:[],materialStudyEvents:[]};
await context.addInitScript(data=>{localStorage.setItem('mahjong-study:v1',JSON.stringify(data));localStorage.setItem('mahjong-study:theme','moe');},seed);
await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
const page=await context.newPage(), results=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const planes=()=>page.evaluate(()=>['::before','::after'].map(pseudo=>{const s=getComputedStyle(document.body,pseudo),m=new DOMMatrix(s.transform==='none'?undefined:s.transform);return {pseudo,name:s.animationName,duration:s.animationDuration,delay:s.animationDelay,state:s.animationPlayState,x:m.m41,y:m.m42,distance:parseFloat(s.getPropertyValue('--moe-drift-distance')),pointer:s.pointerEvents,position:s.position,z:s.zIndex,content:s.content,opacity:s.opacity};}));
const animationTimes=()=>page.evaluate(()=>document.getAnimations().filter(a=>a.animationName==='moe-heart-drift'&&a.effect?.target===document.body).map(a=>({duration:Number(a.effect.getTiming().duration),time:Number(a.currentTime),state:a.playState})).sort((a,b)=>a.duration-b.duration));
const controls=()=>page.locator('.bottom-nav a,.editor-save,.tile-palette button').evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
async function visibleMotion(label) {
  const layout=await controls(),before=await planes(),samples=[before];for(let i=0;i<3;i++){await page.waitForTimeout(400);samples.push(await planes());}const after=samples.at(-1);
  expect(await controls()).toEqual(layout);
  for(let i=0;i<2;i++){expect(before[i].name).toBe('moe-heart-drift');expect(before[i].pointer).toBe('none');expect(before[i].position).toBe('fixed');expect(before[i].z).toBe('-1');expect(after[i].x).toBe(0);expect(Math.max(...samples.map(x=>x[i].y))-Math.min(...samples.map(x=>x[i].y))).toBeGreaterThan(.05);expect(after[i].y).toBeGreaterThanOrEqual(before[i].distance-.01);expect(after[i].y).toBeLessThanOrEqual(.01);}
  expect(before.map(x=>x.distance)).toEqual([-36,-30]);expect(before.map(x=>x.duration)).toEqual(['9s','12s']);results.push({name:label,before,after,samples,controlsStable:true});
}
async function pauseMotion(label) {
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused','');await page.waitForTimeout(100);
  const before=await planes();await page.waitForTimeout(1200);const after=await planes();
  for(let i=0;i<2;i++){expect(before[i].state).toBe('paused');expect(Math.abs(after[i].y-before[i].y)).toBeLessThan(.01);}
  results.push({name:label,before,after});return animationTimes();
}
async function resumeContinuity(before,name){await frame();const after=await animationTimes();expect(after).toHaveLength(2);for(let i=0;i<2;i++){expect(after[i].duration).toBe(before[i].duration);expect(after[i].state).toBe('running');expect(after[i].time-before[i].time).toBeGreaterThanOrEqual(-1);expect(after[i].time-before[i].time).toBeLessThan(500);}results.push({name,before,after});
}
async function nav(name,selector){await page.getByRole('link',{name,exact:true}).click();await discardFixtureDraft(page,selector);await page.locator(selector).waitFor();}
async function capture(name){await page.evaluate(()=>scrollTo(0,0));await page.evaluate(()=>document.fonts.ready);const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,backgroundSize:getComputedStyle(document.documentElement).backgroundSize,backgroundPosition:getComputedStyle(document.documentElement).backgroundPosition,titleFont:getComputedStyle(document.querySelector('h1')).fontFamily}));expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);await page.screenshot({path:`${out}${name}.png`,animations:'disabled'});results.push({name,...geometry});}
try{
  await page.goto(origin);await page.locator('.page--editor').waitFor();await page.evaluate(()=>document.fonts.ready);
  const stored=await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'));
  // Timing uses live animation only; no animation-disabling screenshot in this section.
  await visibleMotion('large-background-planes-advance');
  await page.screenshot({path:`${out}live-heart-motion-before.png`});await page.waitForTimeout(1200);await page.screenshot({path:`${out}live-heart-motion-after.png`});
  const other=await context.newPage();await other.goto(`${origin}/#test`);await other.bringToFront();await page.waitForTimeout(100);
  const nativeVisibility=await page.evaluate(()=>document.visibilityState);
  if(nativeVisibility==='hidden'){
    const nativePaused=await pauseMotion('native-background-tab-pauses');await page.bringToFront();await expect.poll(()=>page.evaluate(()=>document.visibilityState)).toBe('visible');await resumeContinuity(nativePaused,'native-resume-continues-paused-time');await visibleMotion('native-background-tab-resumes');
  }else results.push({name:'native-background-tab',status:'not-observed',visibility:nativeVisibility,limitation:'Headless Chromium kept the page visible; native OS/background behavior is not certified by this run.'});
  await other.close();await page.bringToFront();
  // Explicit synthetic contract check; this is not presented as a native hidden tab.
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  const syntheticPaused=await pauseMotion('synthetic-visibility-hidden-pauses');
  await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('html')).not.toHaveAttribute('data-motion-paused');await resumeContinuity(syntheticPaused,'synthetic-resume-continues-paused-time');await visibleMotion('synthetic-visibility-return-resumes');
  const button=page.getByRole('button',{name:'全消去',exact:true});await button.focus();
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await page.emulateMedia({reducedMotion:'reduce'});await frame();expect((await planes()).every(x=>x.name==='none')).toBe(true);
  await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});await frame();expect((await planes()).every(x=>x.name==='none')).toBe(true);await expect(button).toBeFocused();
  const reducedAll=await page.evaluate(()=>[document.body,...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().width).flatMap(el=>[getComputedStyle(el),getComputedStyle(el,'::before'),getComputedStyle(el,'::after')]).filter(s=>s.animationName!=='none').map(s=>s.animationName));expect(reducedAll).toEqual([]);
  results.push({name:'reduced-motion-stays-static-through-hidden-visible',focusMaintained:true,animations:reducedAll});await capture('moe-motion-reduced-390');await page.emulateMedia({reducedMotion:'no-preference'});
  const viewports=[[320,568],[390,667],[390,844],[430,932],[844,390],[960,600],[1440,900]];
  for(const [width,height]of viewports){await page.setViewportSize({width,height});await nav('テスト','.page--test');const disabled=page.locator('.test-start-actions button:disabled');await expect(disabled).toHaveCSS('opacity','1');await expect(disabled).toHaveCSS('background-color','rgb(241, 230, 236)');await capture(`moe-background-test-${width}x${height}`);await nav('作成','.page--editor');await capture(`moe-background-editor-${width}x${height}`);}
  for(const width of [320,1440]){await page.setViewportSize({width,height:width===320?740:900});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await nav('テスト','.page--test');await capture(`moe-background-test-${width}-text150`);await nav('作成','.page--editor');await capture(`moe-background-editor-${width}-text150`);await page.evaluate(()=>document.documentElement.style.fontSize='');}
  await page.setViewportSize({width:390,height:667});
  for(const name of ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','赤五索','五索','中','中'])await page.locator('.tile-palette').getByRole('button',{name,exact:true}).click();
  await page.evaluate(()=>scrollTo(0,0));await frame();
  const fit=await page.evaluate(()=>({tiles:document.querySelectorAll('.tile-palette button').length,paletteBottom:document.querySelector('.editor-palette').getBoundingClientRect().bottom,navTop:document.querySelector('.bottom-nav').getBoundingClientRect().top}));expect(fit.tiles).toBe(37);expect(fit.paletteBottom).toBeLessThanOrEqual(fit.navTop+1);await capture('moe-dense-editor-390x667');results.push({name:'dense-editor-no-scroll',...fit});
  const hit=await page.locator('.tile-palette button').first().evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});expect(hit).toBe(true);
  await nav('設定','.page--settings');
  for(const [theme,label]of [['normal','ノーマル'],['cool','クール'],['cute','キュート'],['dopa','DOPA'],['moe','MOE']]){await page.getByRole('radio',{name:new RegExp(`^${label}`)}).click();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);const state=await planes();if(theme==='moe')expect(state.every(x=>x.name.includes('moe-'))).toBe(true);else expect(state.some(x=>x.name.includes('moe-'))).toBe(false);results.push({name:`motion-theme-isolation-${theme}`,planes:state});}
  // Seek only after all CSS-controlled pause/resume checks: WAAPI play overrides CSS play-state.
  const amplitude=await page.evaluate(async()=>{
    const animations=document.getAnimations().filter(a=>a.animationName==='moe-heart-drift'&&a.effect?.target===document.body);
    if(animations.length!==2)throw new Error(`Expected two body animation planes, got ${animations.length}`);
    const previous=animations.map(a=>({time:a.currentTime,state:a.playState}));
    animations.forEach(a=>{a.pause();const timing=a.effect.getTiming();a.currentTime=Number(timing.delay)+Number(timing.duration)/2;});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const measured=['::before','::after'].map(pseudo=>{const style=getComputedStyle(document.body,pseudo);return {pseudo,y:new DOMMatrix(style.transform).m42};});
    animations.forEach((a,i)=>{a.currentTime=previous[i].time;if(previous[i].state==='running')a.play();});
    return measured;
  });
  expect(amplitude.map(x=>x.y)).toEqual([-36,-30]);results.push({name:'body-plane-actual-half-cycle-amplitudes',amplitude});
  expect(await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'))).toBe(stored);expect(errors).toEqual([]);
}catch(error){errors.push(error.stack??String(error));await page.screenshot({path:`${out}failure.png`}).catch(()=>{});throw error;}
finally{await writeFile(`${out}results.json`,JSON.stringify({revision,results,errors,limits:['960x600 is a CSS viewport geometry proxy, not a physical browser zoom test.','Synthetic visibility coverage is distinguished from an actually observed hidden browser tab.','Physical iOS Safari and touch behavior are not tested.']},null,2));await browser.close();}
