// Same synthetic saved hand, viewports and themes before/after. Loopback only.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const phase=process.argv[2]??'after';
const origin=new URL(process.env.MAHJONG_TEST_ORIGIN??'http://127.0.0.1:5183').origin;
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw Error('Loopback fixture required');
const out=new URL(`../evidence/meld-layout/${phase}/`,import.meta.url).pathname;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium'});
const melds=['left','opposite','right'].map((from,i)=>({id:from,type:'addedKan',tiles:Array(4).fill(`${i+1}m`),from,calledIndex:i,addedIndex:i}));
melds.push({id:'chi',type:'chi',tiles:['4p','5p','6p'],from:'left',calledIndex:0,addedIndex:null});
const when='2026-10-07T00:00:00.000Z';
const problem={id:'meld-layout',title:'副露の表示確認',concealed:['7z','7z'],drawn:null,melds,doraIndicators:['9s'],answerEnabled:true,acceptedDiscards:['7z'],explanation:'表示確認用の合成データ',privateMemo:'',tagIds:[],context:{roundWind:'1z',handNumber:1,seatWind:'2z',turn:6,honba:0,riichiSticks:0,ownRank:null,scores:{east:25000,south:25000,west:25000,north:25000}},attachments:[],sourceUrl:'',createdAt:when,updatedAt:when};
const seed={schemaVersion:1,revision:1,problems:[problem],tags:[],study:[],attempts:[],settings:{autoSort:true},daily:{},materials:[],materialStudyEvents:[]};
const results=[];
try{
for(const width of [320,390,1440]) for(const theme of ['normal','cool','cute','dopa','moe']){
 const context=await browser.newContext({viewport:{width,height:width===1440?1000:844},serviceWorkers:'block'});
 await context.addInitScript(({seed,theme})=>{localStorage.setItem('mahjong-study:v1',JSON.stringify(seed));localStorage.setItem('mahjong-study:theme',theme);},{seed,theme});
 const page=await context.newPage();
 await page.goto(`${origin}/#/edit/meld-layout`);
 await expect(page.getByRole('heading',{name:'問題を編集',exact:true})).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 await page.locator('.tile-input .hand-stage').scrollIntoViewIfNeeded();
 const boxes=await page.locator('.tile-input .hand-melds').evaluate(el=>{
  const rect=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,flexBasis:s.flexBasis,transform:s.transform,transformOrigin:s.transformOrigin};};
  return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,groups:[...el.querySelectorAll('.meld-view')].map(m=>({label:m.getAttribute('aria-label'),box:rect(m),tiles:[...m.querySelectorAll('.tile-face')].map(t=>({label:t.getAttribute('aria-label'),...rect(t)})),stack:m.querySelector('.meld-view__stack')?rect(m.querySelector('.meld-view__stack')):null}))};
 });
 expect(boxes.documentWidth).toBeLessThanOrEqual(width);
 if(phase==='after')for(const group of boxes.groups.filter(g=>g.stack)){
  const [upper,lower]=group.tiles.filter(t=>t.flexBasis==='auto');
  expect(upper).toBeTruthy();expect(lower).toBeTruthy();
  expect(Math.abs(upper.bottom-lower.y)).toBeLessThan(1);
  expect(Math.abs(lower.bottom-group.box.bottom)).toBeLessThan(1);
  expect(Math.abs(upper.width/lower.height-90/66)).toBeLessThan(.03);
 }
 const name=`${width}-${theme}`;
 await page.screenshot({path:`${out}${name}.png`,animations:'disabled'});
 await page.locator('.tile-input .hand-stage').screenshot({path:`${out}${name}-hand.png`,animations:'disabled'});
 results.push({name,...boxes});await context.close();
}
}finally{await writeFile(`${out}geometry.json`,JSON.stringify(results,null,2));await browser.close();}
