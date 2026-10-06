// Synthetic landscape, portrait and square images; no user photos or private documents.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { openEditorNotes } from './editor-ui-helpers.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('../evidence/header-images/', import.meta.url).pathname;
await mkdir(out, {recursive:true});
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176';
const browser = await chromium.launch({ headless: true });
const results = [], errors = [];
let page;
const fixture = await browser.newPage();
const pictures = await fixture.evaluate(() => [[1600, 900], [900, 1600], [1000, 1000]].map(([width, height], index) => {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const c = canvas.getContext('2d'); c.fillStyle = ['#cdebd8', '#ffd9ea', '#d8e8ff'][index]; c.fillRect(0, 0, width, height);
  c.lineWidth = 20; c.strokeStyle = '#102b40'; c.strokeRect(10, 10, width - 20, height - 20);
  c.fillStyle = '#102b40'; c.font = 'bold 48px sans-serif'; c.fillText(`${width} x ${height}`, 35, 85);
  c.font = '40px sans-serif'; c.fillText('FULL IMAGE BOTTOM', 35, height - 35);
  return canvas.toDataURL('image/png');
})); await fixture.close();
const when = '2026-10-05T00:00:00Z';
const problem = { id: 'image-check', title: '画像の表示確認', concealed: ['1m','2m','3m','1p','2p','3p','1s','2s','3s','4s','0s','5s','7z','7z'], drawn: null, melds: [], doraIndicators: ['4z'], answerEnabled: true, acceptedDiscards: ['7z'], explanation: '解説画像の全体を確認', privateMemo: '', tagIds: [], context: { roundWind: '1z', handNumber: 1, seatWind: '1z', turn: 6, honba: 0, riichiSticks: 0, ownRank: null, scores: {east:25000,south:25000,west:25000,north:25000} }, attachments: pictures.map((dataUrl, i) => ({ id: `image-${i}`, dataUrl, width: [1600,900,1000][i], height:[900,1600,1000][i], role: i === 0 ? 'question' : 'explanation' })), sourceUrl: '', createdAt: when, updatedAt: when };
const seed = {schemaVersion:1,revision:0,problems:[problem],tags:[],study:[{problemId:problem.id,contentRevision:0,confirmationCount:0,lastConfirmedAt:null,understanding:'unrated',lastReviewedAt:null,inTest:true}],attempts:[],settings:{autoSort:true},daily:{},materials:[],materialStudyEvents:[]};
async function checkFrames(name, count) {
  await expect(page.locator('.attachment-thumbnail img')).toHaveCount(count);
  const frames = await page.locator('.attachment-thumbnail img').evaluateAll(images => images.map(img => {
    const r = img.getBoundingClientRect(), s = getComputedStyle(img);
    return {width:r.width,height:r.height,fit:s.objectFit,loaded:img.complete && img.naturalWidth > 0,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight};
  }));
  for (const frame of frames) { expect(frame.loaded).toBe(true); expect(Math.abs(frame.width / frame.height - 16 / 9)).toBeLessThan(.002); expect(frame.fit).toBe('contain'); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  results.push({name,frames});
}
async function screenshot(name, selector) {
  if (selector) await page.locator(selector).first().evaluate(el => el.scrollIntoView({block:'center'}));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({path:`${out}${name}.png`,animations:'disabled'});
}
try {
  for (const theme of ['normal','cool','cute','dopa']) {
    const context = await browser.newContext({viewport:{width:375,height:667},serviceWorkers:'block'});
    await context.addInitScript(({seed,theme}) => {localStorage.setItem('mahjong-study:v1', JSON.stringify(seed));localStorage.setItem('mahjong-study:theme',theme);}, {seed,theme});
    await context.route('**/*', r => {const u = new URL(r.request().url());return u.origin === origin || u.protocol === 'data:' ? r.continue() : r.abort();});
    page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin); await page.getByRole('heading',{name:'問題を作成',exact:true}).waitFor(); await page.evaluate(() => document.fonts.ready);
    for (const width of [320,375,390,1440]) {
      await page.setViewportSize({width,height:width > 1000 ? 900 : 667}); await page.evaluate(() => scrollTo(0,0));
      const header = await page.evaluate(() => {const h = document.querySelector('.page--editor > header'), s = getComputedStyle(h), input = h.querySelector('input'), p = document.querySelector('.editor-palette').getBoundingClientRect(), n = document.querySelector('.bottom-nav').getBoundingClientRect();return {background:s.backgroundColor,image:s.backgroundImage,inputBorder:getComputedStyle(input).borderWidth,paletteBottom:p.bottom,navTop:n.top,overflow:document.documentElement.scrollWidth > innerWidth};});
      expect(header.background).toBe('rgba(0, 0, 0, 0)'); expect(header.image).toBe('none'); expect(header.inputBorder).toBe('1px'); expect(header.overflow).toBe(false);
      if (width === 375 || width === 390) expect(header.paletteBottom).toBeLessThanOrEqual(header.navTop + 1);
      results.push({name:`header-${theme}-${width}`, ...header});
      await screenshot(`header-${theme}-${width}`);
      if(width===375 || width===1440){
        await openEditorNotes(page);
        await page.evaluate(()=>scrollTo(0,350));await screenshot(`header-scrolled-${theme}-${width}`);
        const scrolled=await page.locator('.page--editor > header').evaluate(el=>({scroll:scrollY,top:el.getBoundingClientRect().top,background:getComputedStyle(el).backgroundColor}));
        results.push({name:`header-scrolled-${theme}-${width}`,...scrolled});
        await page.locator('.editor-notes > summary').click();await page.evaluate(()=>scrollTo(0,0));
      }
    }
    await page.setViewportSize({width:320,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await screenshot(`header-${theme}-320-text150`);await page.evaluate(()=>document.documentElement.style.fontSize='');
    await page.getByRole('link',{name:'学習帳',exact:true}).click();
    await page.getByRole('link',{name:/^画像の表示確認/}).click();
    await page.getByRole('link',{name:'編集',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'タイトル（任意）',exact:true})).toHaveValue(problem.title);
    await openEditorNotes(page); await page.locator('.editor-notes > details > summary').click();
    for (const width of [320,375,390,1440]) {await page.setViewportSize({width,height:width > 1000 ? 900 : 667}); await checkFrames(`editor-${theme}-${width}`,3);if(width===375 || width===1440)await screenshot(`editor-${theme}-${width}`,'.attachment-editor');}
    await page.goto(`${origin}/#/problems/image-check`); await page.locator('.attachment-thumbnail').first().waitFor(); await expect(page.locator('.attachment-thumbnail img')).toHaveCount(1); await page.getByRole('button',{name:'正解・解説を表示',exact:true}).click();
    for (const width of [320,375,390,1440]) {await page.setViewportSize({width,height:width > 1000 ? 900 : 667}); await checkFrames(`detail-${theme}-${width}`,3);if(width===375 || width===1440)await screenshot(`detail-explanation-${theme}-${width}`,'[aria-label="解説画像"]');}
    await page.setViewportSize({width:320,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='150%');await checkFrames(`detail-${theme}-320-text150`,3);await screenshot(`detail-${theme}-320-text150`,'[aria-label="解説画像"]');await page.evaluate(()=>document.documentElement.style.fontSize='');
    await page.setViewportSize({width:375,height:667});
    const trigger = page.getByRole('button',{name:'解説画像 1 を拡大',exact:true});
    await trigger.click();
    const natural = await page.locator('.attachment-viewer__viewport img').evaluate(img => {const r=img.getBoundingClientRect();return {width:r.width,height:r.height,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,aspect:getComputedStyle(img).aspectRatio};});
    expect(Math.abs(natural.width/natural.height - 900/1600)).toBeLessThan(.002); expect(natural.aspect).toBe('auto');
    if(theme==='cool') await screenshot('modal-portrait-cool-375');
    await page.getByRole('button',{name:'原寸で表示',exact:true}).click(); expect(await page.locator('.attachment-viewer__viewport').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(trigger).toBeFocused();
    await trigger.click(); await expect(page.getByRole('button',{name:'原寸で表示',exact:true})).toHaveAttribute('aria-pressed','false'); await page.getByRole('button',{name:'閉じる',exact:true}).click(); await expect(trigger).toBeFocused();
    results.push({name:`modal-${theme}`,natural,originalSizeAndReopen:'pass'});
    await page.getByRole('link',{name:'テスト',exact:true}).click(); await page.getByRole('button',{name:'1 問でテスト開始',exact:true}).click(); await checkFrames(`test-question-${theme}`,1);
    await page.locator('.hand-stage').getByRole('button',{name:'中',exact:true}).first().click(); await page.getByRole('button',{name:'回答する',exact:true}).click();
    for (const width of [320,375,390,1440]) {await page.setViewportSize({width,height:width > 1000 ? 900 : 667}); await checkFrames(`test-answer-${theme}-${width}`,3);}
    await context.close();
  }
  expect(errors).toEqual([]);
  await writeFile(`${out}results.json`, JSON.stringify({status:'pass',results,errors},null,2));console.log(JSON.stringify({status:'pass',records:results.length,errors}));
} catch (error) {if(page&&!page.isClosed())await screenshot('failure');await writeFile(`${out}results.json`,JSON.stringify({status:'fail',message:String(error),results,errors},null,2));throw error;} finally {await browser.close();}
