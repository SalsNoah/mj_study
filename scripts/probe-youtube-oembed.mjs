// Direct live network probe. Never proxies or bypasses network policy; failures are evidence.
import {chromium} from '@playwright/test';import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5184';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local app origin required');
const endpoint='https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DM7lc1UVf-VE&format=json';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium'});const results=[];
try{for(const serviceWorkers of ['allow','block']){const ctx=await browser.newContext({serviceWorkers});const page=await ctx.newPage();const events=[];page.on('requestfailed',r=>{if(r.url().includes('/oembed'))events.push({url:r.url(),failure:r.failure()})});await page.goto(`${origin}/#/materials`);if(serviceWorkers==='allow'){await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();}
 const at=new Date().toISOString();const result=await page.evaluate(async endpoint=>{try{const r=await fetch(endpoint,{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(8000)});return{status:r.status,type:r.type,body:await r.text()}}catch(e){return{error:String(e)}}},endpoint);results.push({at,origin,endpoint,serviceWorkers,result,events});await ctx.close();}
}finally{await mkdir('evidence/youtube-title',{recursive:true});await writeFile('evidence/youtube-title/final-live-probe.json',JSON.stringify(results,null,2));await browser.close();}console.log(JSON.stringify(results,null,2));
