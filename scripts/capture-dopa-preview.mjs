// Actual application preview with a synthetic local-only profile.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('../evidence/dopa-preview/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176';
const browser = await chromium.launch({ headless: true });
try {
 const ctx = await browser.newContext({ viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block' });
 await ctx.addInitScript(() => localStorage.setItem('mahjong-study:v1',JSON.stringify({schemaVersion:1,revision:0,problems:[],tags:[],study:[],attempts:[],settings:{autoSort:true},daily:{}})));
 await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page = await ctx.newPage();
 await page.goto(origin);
 await page.getByRole('link',{name:'設定',exact:true}).click();
 await page.getByRole('radio',{name:/^DOPA/}).click();
 await page.getByRole('link',{name:'作成',exact:true}).click();
 for(const name of ['一萬','二萬','三萬','一筒','二筒','三筒','一索','二索','三索','四索','赤五索','五索','中'])await page.locator('.tile-palette').getByRole('button',{name,exact:true}).click();
 await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.documentElement.dataset.theme)).toBe('dopa');
 expect(await page.locator('.tile-palette button').count()).toBe(37);
 await page.evaluate(()=>scrollTo(0,0));
 const geometry = await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,paletteBottom:document.querySelector('.editor-palette').getBoundingClientRect().bottom,navTop:document.querySelector('.bottom-nav').getBoundingClientRect().top}));
 expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width);
 expect(geometry.paletteBottom).toBeLessThanOrEqual(geometry.navTop);
 await page.screenshot({path:`${out}dopa-editor-390.png`,animations:'disabled'});
 await writeFile(`${out}preview.json`,JSON.stringify({status:'pass',theme:'dopa',source:'actual application; synthetic unsaved 13-tile hand',geometry},null,2));
 await ctx.close();
} finally { await browser.close(); }
