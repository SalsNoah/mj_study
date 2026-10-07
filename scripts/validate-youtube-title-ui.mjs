// Local fixture: API responses are mocked; this does not prove live YouTube connectivity.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const origin=process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5174';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local fixture only');
const out='evidence/youtube-title';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium'});
const results=[];
try {for(const width of [320,390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});const page=await context.newPage();let title='麻雀の基本と牌効率を学ぶ',delay=0;
 const calls=[];await page.route('https://www.youtube.com/oembed?**',async route=>{calls.push(route.request().url());await new Promise(r=>setTimeout(r,delay));await route.fulfill({json:{title}}).catch(()=>{});});
 await page.goto(`${origin}/#/materials`);await page.getByRole('button',{name:'教材を追加',exact:true}).click();
 const url=page.getByLabel('URL',{exact:true}),input=page.getByLabel('タイトル（任意）',{exact:true});
 const savedUrl='https://youtu.be/M7lc1UVf-VE?si=private#fragment';await url.fill(savedUrl);await expect(input).toHaveValue(title);expect(calls[0]).not.toContain('private');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 await page.screenshot({path:`${out}/${width}-autofill.png`,fullPage:true});
 await input.fill('自分で編集した名前');await url.fill('https://youtube.com/shorts/abcdefghijk');await expect(input).toHaveValue('自分で編集した名前');
 await url.fill(savedUrl);await page.getByRole('button',{name:'登録する',exact:true}).click();await expect(page.getByRole('heading',{name:'自分で編集した名前',exact:true})).toBeVisible();
 const store=await page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1')));expect(store.materials.find(m=>m.title==='自分で編集した名前').url).toBe(savedUrl);expect(store.materialStudyEvents??[]).toHaveLength(0);
 // Fresh draft, save before delayed response: host fallback is permanent.
 await page.locator('.material-back').click();await page.getByRole('button',{name:'教材を追加',exact:true}).click();delay=700;title='保存後に届くタイトル';await url.fill('https://youtu.be/abcdefghijk');await page.waitForTimeout(350);await page.getByRole('button',{name:'登録する',exact:true}).click();await expect(page.getByRole('heading',{name:'youtu.be',exact:true})).toBeVisible();await page.waitForTimeout(800);await expect(page.getByRole('heading',{name:'youtu.be',exact:true})).toBeVisible();
 results.push({width,status:'passed',mocked:true,checks:['autofill','manual edit preserved','URL preserved','no study increment','save during request','no overflow']});await context.close();
}}finally{await writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2));await browser.close();}
