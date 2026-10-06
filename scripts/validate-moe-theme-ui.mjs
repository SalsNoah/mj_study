// Generated local artwork and synthetic study profiles only. No external content.
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const out = new URL('../evidence/moe-theme/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176';
const browser = await chromium.launch({ headless: true });
const results = [], errors = [];
let page;
const date = '2026-10-05T03:00:00Z';
const problem = { id: 'moe-problem', title: '牌と条件を確かめて判断の理由を振り返る', concealed: ['1m','2m','3m','1p','2p','3p','1s','2s','3s','4s','0s','5s','7z','7z'], drawn: null, melds: [], doraIndicators: ['4z'], answerEnabled: true, acceptedDiscards: ['7z'], explanation: '巡目と残り枚数を確かめて選ぶ。', privateMemo: '', tagIds: [], context: { roundWind:'1z', handNumber:1, seatWind:'1z', turn:6, honba:0, riichiSticks:0, ownRank:null, scores:{east:25000,south:25000,west:25000,north:25000} }, attachments: [], sourceUrl: '', createdAt: date, updatedAt: date };
const material = { id: 'moe-material', title: '学んだ内容を何度も復習する', url: 'https://example.com/study', comment: '手順を振り返る', createdAt: date, updatedAt: date };
const seed = { schemaVersion: 1, revision: 0, problems: [problem], tags: [], study: [{problemId:problem.id, contentRevision:0, confirmationCount:0, lastConfirmedAt:null, understanding:'unrated', lastReviewedAt:null, inTest:true}], attempts: [], settings: { autoSort:true }, daily: {}, materials: [material], materialStudyEvents: [] };
async function open(failImages = false, failFont = false) {
  const context = await browser.newContext({viewport:{width:390,height:740}, serviceWorkers:'block'});
  const failed = [];
  await context.addInitScript(data => { if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(data)); if(!localStorage.getItem('mahjong-study:theme'))localStorage.setItem('mahjong-study:theme','moe'); }, seed);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (failImages && url.pathname.startsWith('/themes/moe/')) { failed.push(url.pathname); return route.abort(); }
    if (failFont && url.pathname.startsWith('/fonts/mochiy-pop-one/')) { failed.push(url.pathname); return route.abort(); }
    return url.origin === origin || ['blob:','data:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin); await page.locator('.page--editor').waitFor();
  await expect(page.locator('html')).toHaveAttribute('data-theme','moe');
  return {context,failed};
}
async function nav(name) { await page.getByRole('link',{name,exact:true}).click(); await page.locator({'作成':'.page--editor','学習帳':'.page--library','テスト':'.page--test','学習教材':'.page--materials','記録帳':'.page--records','設定':'.page--settings'}[name]).waitFor(); }
async function capture(name, selector) {
  if (selector) await page.locator(selector).scrollIntoViewIfNeeded(); else await page.evaluate(() => scrollTo(0,0));
  await page.evaluate(() => document.fonts.ready);
  if (await page.locator('.problem-card').count()) await expect.poll(() => page.locator('.problem-card').first().evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  const geometry = await page.evaluate(() => ({width:innerWidth, documentWidth:document.documentElement.scrollWidth, height:innerHeight, nav:(()=>{const el=document.querySelector('.bottom-nav'), r=el.getBoundingClientRect(), s=getComputedStyle(el);return {top:r.top,borders:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth]};})()}));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width);
  if (geometry.width < 1100) expect(geometry.nav.borders).toEqual(['1px','0px','0px','0px']);
  await page.screenshot({path:`${out}${name}.png`,animations:'disabled'}); results.push({name,...geometry});
}
async function controlState(name, locator) {
  const value = await locator.evaluate(el => {
    const r=el.getBoundingClientRect(),s=getComputedStyle(el),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {text:el.textContent,box:{x:r.x,y:r.y,width:r.width,height:r.height},hit:!!hit&&el.contains(hit),color:s.color,background:s.backgroundColor,backgroundImage:s.backgroundImage,outline:s.outlineStyle,outlineWidth:s.outlineWidth,opacity:s.opacity,disabled:el.disabled??false};
  });
  results.push({name,...value}); return value;
}
try {
  const manifest = JSON.parse(await readFile(new URL('../docs/moe-art-sources.json',import.meta.url),'utf8'));
  expect(manifest.assets).toHaveLength(7);
  for (const asset of manifest.assets) { const bytes=await readFile(new URL(`../${asset.path}`,import.meta.url)); expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256); }
  const {context} = await open();
  const beforeStore = await page.evaluate(() => localStorage.getItem('mahjong-study:v1'));
  await expect.poll(() => page.evaluate(() => [...document.fonts].some(font => font.family.replaceAll('"','') === 'Mochiy Pop One'))).toBe(true);
  const fonts = await page.evaluate(async () => (await document.fonts.load('400 18px "Mochiy Pop One"', '麻雀学習帳受入れ解説メモ')).map(font => ({family:font.family,status:font.status,weight:font.weight})));
  expect(fonts.length).toBeGreaterThan(0); expect(fonts.every(font => font.status === 'loaded')).toBe(true);
  results.push({name:'mochiy-font-loaded',fonts});
  const images = await page.evaluate(async () => Promise.all(['background','card'].map(name => new Promise((resolve,reject) => {const image=new Image();image.onload=()=>resolve({name,width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>reject(new Error(name));image.src=new URL(`themes/moe/${name}.webp`,location.href.split('#')[0]).href;}))));
  for (const image of images) { expect(image.width).toBe(1536); expect(image.height).toBe(1024); }
  results.push({name:'moe-art-loaded',images});
  // Slot identity follows fixed positions; revealing a tile never changes its value or neighbors.
  await page.locator('.wanpai').getByRole('button',{name:'北',exact:true}).click();
  const expectedFaces=['maid-01-black-long','maid-02-chestnut-bob','maid-03-honey-updo','maid-04-silver-braid','maid-05-lavender-waves'];
  const decodedFaces=await page.evaluate(async names=>Promise.all(names.map(name=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({name,width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>reject(new Error(name));image.src=new URL(`themes/moe/${name}.webp`,location.href.split('#')[0]).href;}))),expectedFaces);
  for(const face of decodedFaces){expect(face.width).toBe(264);expect(face.height).toBe(360);}
  const faces=await page.locator('.wanpai > .is-back .tile-back').evaluateAll(items=>items.map(el=>({image:getComputedStyle(el).backgroundImage,shadow:getComputedStyle(el).boxShadow})));
  expect(faces).toHaveLength(5); faces.forEach((face,index)=>expect(face.image).toContain(`${expectedFaces[index]}.webp`));
  for(const width of [320,375,390,1440]){await page.setViewportSize({width,height:width===1440?900:667});await capture(`moe-five-maids-${width}`);}
  await page.setViewportSize({width:320,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await capture('moe-five-maids-320-text150');await page.evaluate(()=>document.documentElement.style.fontSize='');
  await page.getByRole('tab',{name:'ドラ表示牌',exact:true}).click();
  await page.locator('.tile-palette').getByRole('button',{name:'北',exact:true}).click();
  await expect(page.locator('.wanpai > button').first()).toHaveAttribute('aria-label','北');
  await expect(page.locator('.wanpai > button .tile-back')).toHaveCount(0);
  expect(await page.locator('.wanpai > .is-back .tile-back').first().evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('maid-02-chestnut-bob.webp');
  for(const name of ['一萬','二萬','三萬','中'])await page.locator('.tile-palette').getByRole('button',{name,exact:true}).click();
  await expect(page.locator('.wanpai > .is-back')).toHaveCount(0);await expect(page.locator('.wanpai > button')).toHaveCount(5);
  await capture('moe-all-real-dora-faces');
  for(const name of ['中','三萬','二萬','一萬'])await page.locator('.wanpai').getByRole('button',{name,exact:true}).click();
  await page.getByRole('tab',{name:'手牌',exact:true}).click();
  results.push({name:'moe-decorative-backs-only',faces,decodedFaces,zeroOneFiveAndRemoval:'pass'});
  for (const width of [320,375,390,1440]) {
    await page.setViewportSize({width,height:width===1440?900:667});
    for (const route of ['作成','学習帳','テスト','学習教材','記録帳','設定']) { await nav(route); await capture(`moe-${{'作成':'editor','学習帳':'library','テスト':'test','学習教材':'materials','記録帳':'records','設定':'settings'}[route]}-${width}`); }
    await nav('学習帳'); await page.locator('.problem-card').click(); await expect(page.getByRole('button',{name:'正解・解説を表示',exact:true})).toBeVisible(); await capture(`moe-detail-hidden-${width}`);
    await expect(page.getByRole('button',{name:'正解・解説を表示',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'正解・解説を表示',exact:true}).click(); await page.locator('.detail-tools > summary').click();
    await page.getByRole('button',{name:'複製',exact:true}).click(); await expect(page.getByRole('dialog')).toBeVisible(); await capture(`moe-duplicate-${width}`); await page.keyboard.press('Escape');
  }
  await nav('設定'); await expect(page.getByRole('radio',{name:/^MOE/})).toHaveAttribute('aria-checked','true');
  await page.reload(); await page.locator('.page--settings').waitFor(); await expect(page.locator('html')).toHaveAttribute('data-theme','moe');
  expect(await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'))).toBe(beforeStore);
  // Reload a different chosen theme first, so init code cannot fake persistence.
  await page.getByRole('radio',{name:/^クール/}).click(); await page.reload(); await page.locator('.page--settings').waitFor(); await expect(page.locator('html')).toHaveAttribute('data-theme','cool');
  await page.getByRole('radio',{name:/^MOE/}).click(); await page.reload(); await page.locator('.page--settings').waitFor(); await expect(page.locator('html')).toHaveAttribute('data-theme','moe');
  results.push({name:'actual-reload-theme-persistence',status:'pass'});
  await nav('作成'); await page.setViewportSize({width:390,height:667});
  const undo=page.getByRole('button',{name:'戻す',exact:true}); await expect(undo).toBeDisabled(); await controlState('moe-disabled-undo',undo);
  for (const tile of ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','赤五索','五索','中','中']) await page.locator('.tile-palette').getByRole('button',{name:tile,exact:true}).click();
  for (const width of [375,390]) {
    await page.setViewportSize({width,height:667}); await capture(`moe-editor-full-${width}-667`);
    const fit=await page.evaluate(()=>({palette:document.querySelector('.editor-palette').getBoundingClientRect().bottom,nav:document.querySelector('.bottom-nav').getBoundingClientRect().top,tiles:document.querySelectorAll('.tile-palette button').length}));
    expect(fit.tiles).toBe(37); expect(fit.palette).toBeLessThanOrEqual(fit.nav+1); results.push({name:`moe-no-scroll-${width}`,...fit});
  }
  await expect(undo).toBeEnabled(); const plain=await controlState('moe-enabled-undo',undo); expect(plain.hit).toBe(true);
  await page.setViewportSize({width:1440,height:900});
  const save=page.locator('.editor-save'); await save.scrollIntoViewIfNeeded(); await page.mouse.move(0,0);
  const primary=await controlState('moe-primary-normal',save); expect(primary.color).toBe('rgb(255, 255, 255)'); expect(primary.backgroundImage).toContain('rgb(185, 52, 109)');
  await save.hover(); const primaryHover=await controlState('moe-primary-hover',save); expect(primaryHover.color).toBe('rgb(255, 255, 255)'); expect(primaryHover.background).toBe('rgb(146, 32, 79)'); await capture('moe-primary-hover');
  await page.mouse.down(); const primaryActive=await controlState('moe-primary-active',save); expect(primaryActive.color).toBe('rgb(255, 255, 255)'); expect(primaryActive.background).toBe('rgb(146, 32, 79)'); await page.screenshot({path:`${out}moe-primary-active.png`,animations:'disabled'}); await page.mouse.move(0,0); await page.mouse.up();
  expect(await page.evaluate(()=>localStorage.getItem('mahjong-study:v1'))).toBe(beforeStore);
  await page.setViewportSize({width:390,height:667});

  await undo.hover(); await controlState('moe-hover-undo',undo); await capture('moe-hover-control');
  await undo.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  const focus=await controlState('moe-focus-undo',undo); expect(parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2); await capture('moe-focus-control');
  await page.getByRole('button',{name:'残枚数',exact:true}).click(); await capture('moe-remaining-390','.remaining-panel');
  await page.getByRole('button',{name:'残枚数',exact:true}).click();
  await page.locator('.editor-notes > summary').click(); await capture('moe-notes-390','.editor-notes');
  const animationState=()=>page.evaluate(()=>[document.body,document.getElementById('root'),...document.querySelectorAll('.page-header h1,.panel,.btn,.bottom-nav__item.is-active')].filter(Boolean).flatMap(el=>['::before','::after'].map(pseudo=>{const s=getComputedStyle(el,pseudo);return {tag:el.tagName,className:el.className,pseudo,name:s.animationName,duration:s.animationDuration,transform:s.transform,position:s.backgroundPosition,opacity:s.opacity,pointer:s.pointerEvents,content:s.content};})).filter(s=>s.name.includes('moe-')));
  const motionBefore=await animationState(); expect(motionBefore.length).toBeGreaterThan(0);
  for(const item of motionBefore) { for(const duration of item.duration.split(',')) expect(parseFloat(duration)).toBeGreaterThanOrEqual(4); expect(item.pointer).toBe('none'); }
  await page.screenshot({path:`${out}moe-motion-before.png`}); await page.waitForTimeout(1200); const motionAfter=await animationState(); await page.screenshot({path:`${out}moe-motion-after.png`});
  expect(JSON.stringify(motionAfter)).not.toBe(JSON.stringify(motionBefore)); results.push({name:'moe-decorative-motion',before:motionBefore,after:motionAfter});
  await nav('学習帳'); await page.locator('.problem-card').click(); await page.locator('.detail-tools > summary').click();
  const danger=page.getByRole('button',{name:'削除',exact:true}); await danger.scrollIntoViewIfNeeded(); await page.mouse.move(0,0); const dangerPlain=await controlState('moe-danger-normal',danger); expect(dangerPlain.color).toBe('rgb(157, 39, 63)'); expect(dangerPlain.background).toBe('rgb(255, 237, 240)');
  await danger.hover(); const dangerHover=await controlState('moe-danger-hover',danger); expect(dangerHover.color).toBe('rgb(157, 39, 63)'); expect(dangerHover.background).toBe('rgb(255, 220, 227)'); await page.screenshot({path:`${out}moe-danger-hover.png`,animations:'disabled'}); await page.mouse.move(0,0);
  await nav('テスト'); await page.getByRole('button',{name:'1 問でテスト開始',exact:true}).click(); await expect(page.getByRole('button',{name:'回答する',exact:true})).toBeVisible(); await capture('moe-test-question');
  await page.locator('.hand-stage').getByRole('button',{name:'中',exact:true}).first().click(); await page.getByRole('button',{name:'回答する',exact:true}).click(); await page.locator('.verdict').waitFor(); await capture('moe-test-answer');
  await nav('学習教材'); await page.locator('.material-record-link').click(); await page.locator('.page--material-detail').waitFor(); await capture('moe-material-detail');
  await nav('記録帳'); await page.getByRole('button',{name:'Xに記録を投稿',exact:true}).click(); await page.locator('.record-share-preview').waitFor(); await capture('moe-record-share'); await page.getByRole('button',{name:'閉じる',exact:true}).click();
  await page.setViewportSize({width:320,height:740}); await page.evaluate(()=>document.documentElement.style.fontSize='150%');
  for (const route of ['作成','学習帳','テスト','記録帳','設定']) { await nav(route); await capture(`moe-${{'作成':'editor','学習帳':'library','テスト':'test','記録帳':'records','設定':'settings'}[route]}-320-text150`); }
  await page.evaluate(()=>document.documentElement.style.fontSize='');
  await page.emulateMedia({reducedMotion:'reduce'}); await nav('作成'); await capture('moe-reduced-motion');
  const reduced=await page.evaluate(()=>[document.body,...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().width).flatMap(el=>[getComputedStyle(el),getComputedStyle(el,'::before'),getComputedStyle(el,'::after')]).filter(s=>s.animationName!=='none').map(s=>s.animationName));
  expect(reduced).toEqual([]); results.push({name:'moe-reduced-motion-static',animations:reduced});
  await nav('設定');
  for(const [id,label] of [['normal','ノーマル'],['cool','クール'],['cute','キュート'],['dopa','DOPA']]) { await page.getByRole('radio',{name:new RegExp(`^${label}`)}).click(); await nav('学習帳'); const art=await page.evaluate(()=>({global:getComputedStyle(document.documentElement).backgroundImage,card:getComputedStyle(document.querySelector('.problem-card'),'::after').backgroundImage})); expect(JSON.stringify(art)).not.toContain('/moe/'); await capture(`isolation-${id}`);
    await nav('作成');const editor=await page.evaluate(()=>({backs:[...document.querySelectorAll('.wanpai > .is-back .tile-back')].map(el=>getComputedStyle(el).backgroundImage),font:getComputedStyle(document.querySelector('h1')).fontFamily}));expect(editor.backs.every(image=>!image.includes('/moe/'))).toBe(true);expect(editor.font).not.toContain('Mochiy');await capture(`isolation-editor-${id}`);results.push({name:`maid-font-isolation-${id}`,...editor});await nav('設定'); }
  await context.close();
  const fallback=await open(true); await capture('moe-maid-failure-editor-390');
  const failedBack=await page.locator('.wanpai > .is-back .tile-back').evaluateAll(items=>items.map(el=>({color:getComputedStyle(el).backgroundColor,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
  expect(failedBack).toHaveLength(4); expect(failedBack.every(back=>back.color!=='rgba(0, 0, 0, 0)'&&back.width>0&&back.height>0)).toBe(true);
  await nav('学習帳'); await capture('moe-art-failure-390'); await page.setViewportSize({width:1440,height:900}); await capture('moe-art-failure-1440');
  expect(fallback.failed).toContain('/themes/moe/background.webp'); expect(fallback.failed).toContain('/themes/moe/card.webp');
  results.push({name:'moe-failed-art-keeps-tile-backs',failedBack}); await fallback.context.close();
  const fontFallback=await open(false,true);
  await expect.poll(()=>fontFallback.failed.some(path=>path.startsWith('/fonts/mochiy-pop-one/'))).toBe(true);
  await page.evaluate(()=>document.fonts.ready); await capture('moe-font-failure-390');
  await page.setViewportSize({width:320,height:740}); await capture('moe-font-failure-320');
  expect(fontFallback.failed.some(path=>path.startsWith('/fonts/mochiy-pop-one/'))).toBe(true);
  await expect(page.getByRole('heading',{name:'問題を作成',exact:true})).toBeVisible();
  await expect(page.locator('.tile-palette button')).toHaveCount(37);
  const fontLoaded=await page.evaluate(()=>document.fonts.check('400 18px "Mochiy Pop One"','麻雀学習帳'));
  expect(fontLoaded).toBe(false); results.push({name:'mochiy-failed-font-readable-fallback',fontLoaded});
  await fontFallback.context.close();
  expect(errors).toEqual([]);
} catch(error) { errors.push(error.stack??String(error)); if(page&&!page.isClosed())await page.screenshot({path:`${out}failure.png`,animations:'disabled'}).catch(()=>{}); throw error; }
finally { await writeFile(`${out}results.json`,JSON.stringify({results,errors},null,2)); await browser.close(); }
