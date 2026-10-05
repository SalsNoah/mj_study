// Display the approved bitmap unchanged, with browser/OS-like CSS masks for inspection.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const out=new URL('../evidence/icons/',import.meta.url).pathname;await mkdir(out,{recursive:true});
const origin=process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5176';
const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1180,height:1000},serviceWorkers:'block'});
await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===origin||url.protocol==='data:'?route.continue():route.abort();});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin);await page.getByRole('heading',{name:'問題を作成',exact:true}).waitFor();
 const links=await page.locator('link[rel="icon"],link[rel="apple-touch-icon"]').evaluateAll(els=>els.map(el=>({href:el.getAttribute('href'),sizes:el.getAttribute('sizes'),rel:el.getAttribute('rel')})));
 expect(links.filter(x=>x.rel==='icon').length).toBe(3);
 const asset=(file,size,shape='')=>`<figure><div class="sample ${shape}" style="width:${size}px;height:${size}px"><img src="${origin}/icons/${file}" width="${size}" height="${size}"></div><figcaption>${file} · ${size}px ${shape}</figcaption></figure>`;
 await page.setContent(`<html lang="ja"><head><meta charset="utf-8"><style>body{margin:24px;background:#eef2ed;color:#21372d;font:16px system-ui}h1{font-size:24px}.row{display:flex;align-items:flex-end;gap:24px;flex-wrap:wrap;margin:20px 0}figure{margin:0}.sample{position:relative;overflow:hidden;background:#fff}.sample img{display:block}.circle{border-radius:50%}.round{border-radius:24%}.safe:after{content:'';position:absolute;left:10%;top:10%;width:80%;height:80%;border:2px dashed #2b806f;border-radius:50%;box-sizing:border-box}figcaption{max-width:230px;font-size:12px;margin-top:7px}</style></head><body><h1>Approved icon size / OS-mask inspection</h1><div class="row">${asset('icon-16.png',16)}${asset('icon-32.png',32)}${asset('icon-192.png',64)}${asset('apple-touch-icon.png',180,'round')}${asset('icon-192.png',192,'circle')}</div><div class="row">${asset('icon-512.png',512)}${asset('icon-512.png',192,'safe')}${asset('icon-512.png',192,'circle')}</div></body></html>`);
 await expect(page.locator('img')).toHaveCount(8);
 await page.locator('img').evaluateAll(async imgs=>{await Promise.all(imgs.map(img=>img.decode()));});
 const dimensions=await page.locator('img').evaluateAll(imgs=>imgs.map(img=>({src:img.getAttribute('src'),naturalWidth:img.naturalWidth,width:img.width,complete:img.complete})));
 expect(dimensions.every(x=>x.complete&&x.naturalWidth>0)).toBe(true);expect(errors).toEqual([]);
 await page.screenshot({path:`${out}approved-icon-sizes-and-masks.png`,fullPage:true,animations:'disabled'});
 const hashes={};for(const file of ['icon-16.png','icon-32.png','icon-192.png','icon-512.png','apple-touch-icon.png'])hashes[file]=createHash('sha256').update(await readFile(new URL(`../public/icons/${file}`,import.meta.url))).digest('hex');
 await writeFile(`${out}icon-results.json`,JSON.stringify({status:'pass',links,dimensions,hashes,errors},null,2));
}catch(error){await writeFile(`${out}icon-results.json`,JSON.stringify({status:'fail',message:String(error),errors},null,2));throw error;}finally{await browser.close();}
