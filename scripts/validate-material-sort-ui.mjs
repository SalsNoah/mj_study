// Local fixture browser verification: sorting never rewrites saved records.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5184';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local fixture only');
const out='evidence/material-sort';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
const dates=['2026-10-01T10:00:00+09:00','2026-10-01T02:00:00Z','2026-10-01T03:00:00Z','2026-10-01T03:00:00Z'];
const materials=['A','B','C','D'].map((id,i)=>({id,title:id,url:`https://example.com/${id}`,comment:`${id}のコメント`,createdAt:dates[i],updatedAt:dates[i]}));
const events=[...Array.from({length:10},(_,i)=>({id:`a${i}`,materialId:'A',at:'2026-10-01T01:00:00Z',title:'A',url:materials[0].url,comment:'過去の記録'})),...Array.from({length:2},(_,i)=>({id:`b${i}`,materialId:'B',at:`2026-10-01T0${i*2}:00:00Z`,title:'B',url:materials[1].url,comment:'過去の記録'}))];
const seed={schemaVersion:1,revision:1,problems:[],tags:[],study:[],attempts:[],settings:{autoSort:true},daily:{},materials,materialStudyEvents:events};
const results=[];
try{for(const width of [320,390,1440]){
 const context=await browser.newContext({viewport:{width,height:width===1440?900:844},serviceWorkers:'block'});await context.addInitScript(seed=>{if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(seed));},seed);
 const page=await context.newPage();await page.goto(`${origin}/#/materials`);
 const read=()=>page.evaluate(()=>localStorage.getItem('mahjong-study:v1'));
 const titles=()=>page.locator('.material-card h2').allTextContents();const key=page.getByRole('combobox',{name:'並び替え',exact:true});const direction=page.getByRole('combobox',{name:'順序',exact:true});
 const before=await read();await expect(page.locator('.material-card h2')).toHaveText(['C','D','B','A']);
 for(const [k,d,expected] of [['studyCount','asc',['C','D','B','A']],['studyCount','desc',['A','B','C','D']],['updatedAt','asc',['A','B','C','D']],['updatedAt','desc',['C','D','B','A']],['lastStudiedAt','asc',['A','B','C','D']],['lastStudiedAt','desc',['B','A','C','D']]]){
  await key.selectOption(k);await direction.selectOption(d);await expect(page.locator('.material-card h2')).toHaveText(expected);expect(await read()).toBe(before);
 }
 await key.focus();await page.keyboard.press('Home');await expect(key).toHaveValue('updatedAt');await page.keyboard.press('Tab');await expect(direction).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'並べ直す',exact:true})).toBeFocused();
 await key.selectOption('studyCount');await direction.selectOption('asc');
 const card=id=>page.locator('.material-card').filter({has:page.getByRole('heading',{name:id,exact:true})});
 await card('C').getByRole('button',{name:'Cを学習した',exact:true}).click();await expect(page.locator('.material-card h2')).toHaveText(['C','D','B','A']);
 let saved=JSON.parse(await read());expect(saved.materialStudyEvents).toHaveLength(13);expect(saved.materials.find(m=>m.id==='C').comment).toBe('Cのコメント');
 const afterStudy=await read();await page.getByRole('button',{name:'並べ直す',exact:true}).click();await expect(page.locator('.material-card h2')).toHaveText(['D','C','B','A']);expect(await read()).toBe(afterStudy);
 const search=page.getByRole('searchbox');await search.fill('B');await direction.selectOption('desc');await expect(page.locator('.material-card h2')).toHaveText(['B']);await search.fill('');await expect(page.locator('.material-card h2')).toHaveText(['A','B','C','D']);expect(await read()).toBe(afterStudy);
 await card('B').getByRole('button',{name:'Bをアーカイブ',exact:true}).click();await page.getByRole('button',{name:'アーカイブする',exact:true}).click();await expect(page.locator('.material-card h2')).toHaveText(['A','C','D']);
 await page.getByRole('button',{name:'アーカイブ 1 件',exact:true}).click();await expect(page.locator('.material-card h2')).toHaveText(['B']);await direction.selectOption('asc');await card('B').getByRole('button',{name:'Bを学習中に復元',exact:true}).click();
 await page.getByRole('button',{name:'学習中 4 件',exact:true}).click();await expect(page.locator('.material-card h2')).toHaveText(['D','C','B','A']);
 saved=JSON.parse(await read());expect(saved.materialStudyEvents).toHaveLength(13);expect(saved.materials.map(m=>m.comment)).toEqual(materials.map(m=>m.comment));
 await key.selectOption('lastStudiedAt');await direction.selectOption('desc');await expect(page.locator('.material-card h2')).toHaveText(['C','B','A','D']);
 await page.screenshot({path:`${out}/${width}-sort.png`,fullPage:false});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 await card('D').locator('.material-record-link').scrollIntoViewIfNeeded();await expect(card('D').locator('.material-record-link')).toBeInViewport();
 await card('C').locator('.material-record-link').click();await page.getByRole('button',{name:'直前の学習を取り消す',exact:true}).click();
 await page.locator('.material-back').click();await key.selectOption('lastStudiedAt');await expect(page.locator('.material-card h2')).toHaveText(['B','A','C','D']);
 expect(JSON.parse(await read()).materialStudyEvents).toEqual(events);
 results.push({width,status:'pass',checks:['six permutations','numeric 2 vs 10','timezone comparison','never studied last both directions','stable ties','no sort persistence','keyboard','study freezes until refresh','search','archive/restore','undo','comments/history preserved','no overflow','last card reachable']});await context.close();
}}finally{await writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2));await browser.close();}
