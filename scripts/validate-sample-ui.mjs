// Isolated browser profiles containing only synthetic and bundled sample data.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const evidence = new URL('../evidence/samples/', import.meta.url).pathname;
await mkdir(evidence, { recursive: true });
const origin = process.env.MAHJONG_TEST_ORIGIN ?? 'http://127.0.0.1:5176';
const browser = await chromium.launch({ headless: true });
const results = [], errors = [];
let page;
const emptyContext = () => ({ roundWind:null, handNumber:null, seatWind:null, turn:null, honba:null, riichiSticks:null, ownRank:null, scores:{east:null,south:null,west:null,north:null} });
const when = '2026-01-01T00:00:00Z';
const baseProblem = { drawn:null, melds:[], privateMemo:'', tagIds:['sample-tag'], attachments:[], sourceUrl:'', createdAt:when, updatedAt:when };
const legacyOne = { ...baseProblem, id:'old-one', title:'サンプル：リャンメンを残す', concealed:['2m','3m','4m','5m','6m','7m','8m','2p','3p','4p','5s','6s','7s','1z'], doraIndicators:['1p'], answerEnabled:true, acceptedDiscards:['1z'], explanation:'字牌の孤立を切り、数牌の受け入れを残す一例です（正解は学習用の仮置き）。', context:{...emptyContext(),seatWind:'1z',turn:5} };
const legacyTwo = { ...baseProblem, id:'old-two', title:'サンプル：正解なしメモ', concealed:['1s','2s','3s','4s','5s','0s','6s','3p','3p','3p','9m','9m','9m'], doraIndicators:[], answerEnabled:false, acceptedDiscards:[], explanation:'形を眺めて自分の判断をメモする例です。正解は設定していません。', context:emptyContext() };
const oldEdited = { ...legacyOne, id:'edited-old', privateMemo:'残す編集メモ' };
const ownProblem = { ...legacyOne, id:'own', title:'サンプル：自分で作った問題', privateMemo:'自作を保持' };
const study = id => ({problemId:id,contentRevision:0,confirmationCount:0,lastConfirmedAt:null,understanding:'unrated',lastReviewedAt:null,lastSolvedAt:null,lastCorrectAt:null});
const legacyFixture = { schemaVersion:1, revision:1, problems:[legacyOne,legacyTwo,oldEdited,ownProblem], tags:[{id:'sample-tag',name:'サンプル'}], study:[study('old-one'),study('old-two'),study('edited-old'),study('own')], attempts:[], settings:{autoSort:true}, daily:{} };
legacyFixture.study[0].confirmationCount=2;
legacyFixture.study[0].lastConfirmedAt=when;

async function open(seed) {
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  if(seed)await context.addInitScript(data=>{if(!localStorage.getItem('mahjong-study:v1'))localStorage.setItem('mahjong-study:v1',JSON.stringify(data));},seed);
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin||url.protocol==='data:')await route.continue();else await route.abort();});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);return context;
}
async function sampleSettings() {
  await page.getByRole('link',{name:'設定',exact:true}).click();
  await page.getByRole('tab',{name:'データ管理',exact:true}).click();
  await page.locator('.sample-catalog > summary').click();
}
async function stored() { return await page.evaluate(()=>JSON.parse(localStorage.getItem('mahjong-study:v1'))); }
async function capture(name) {
  await page.screenshot({path:`${evidence}${name}.png`,fullPage:true,animations:'disabled'});
  const geometry=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,
    separateDrawn:document.querySelectorAll('.hand-view__drawn').length,
    controls:[...document.querySelectorAll('.sample-catalog button')].filter(el=>el.getBoundingClientRect().width>0).map(el=>({text:el.textContent,height:el.getBoundingClientRect().height}))}));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width);expect(geometry.separateDrawn).toBe(0);
  for(const c of geometry.controls)expect(c.height).toBeGreaterThanOrEqual(44);
  results.push({name,geometry});
  // Full-page captures include the fixed navigation band. Also prove the actual
  // scrolled viewport at each important mobile/desktop control.
  for(const [part,selector] of [['candidate','.sample-candidates input:visible'],['primary','.sample-catalog > button:visible'],['restore','.sample-backup .btn-row button:last-child:visible']]){
    const control=page.locator(selector).first();if(!await control.count())continue;
    await control.evaluate(el=>el.scrollIntoView({block:'center'}));
    const box=await control.evaluate(el=>{const r=el.getBoundingClientRect(),n=document.querySelector('.bottom-nav').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {top:r.top,bottom:r.bottom,clearTop:innerWidth>=1100?n.bottom:0,clearBottom:innerWidth>=1100?innerHeight:n.top,hit:!!hit&&el.contains(hit)}});
    expect(box.top).toBeGreaterThanOrEqual(box.clearTop-1);expect(box.bottom).toBeLessThanOrEqual(box.clearBottom+1);expect(box.hit).toBe(true);
    await page.screenshot({path:`${evidence}${name}-${part}-viewport.png`,fullPage:false,animations:'disabled'});
    results.push({name:`${name}-${part}-viewport`,control:box});
  }
}
async function sizes(name) {for(const width of [320,375,390,1440]){await page.setViewportSize({width,height:width===1440?900:844});await capture(`${name}-${width}`);}}
function label(code){if(code[1]==='z')return ['','東','南','西','北','白','發','中'][Number(code[0])];return `${code[0]==='0'?'赤五':['','一','二','三','四','五','六','七','八','九'][Number(code[0])]}${{m:'萬',p:'筒',s:'索'}[code[1]]}`;}
try {
  const fresh=await open();await sampleSettings();
  await expect(page.locator('.sample-candidates input')).toHaveCount(0);
  await sizes('fresh-before');
  await page.getByRole('button',{name:'サンプル10題を追加',exact:true}).click();
  await expect(page.getByRole('button',{name:'この10題は追加済み',exact:true})).toBeDisabled();
  const added=await stored();expect(added.problems).toHaveLength(10);
  expect(added.problems.filter(p=>p.answerEnabled)).toHaveLength(8);
  for(const p of added.problems){expect(p.drawn).toBe(null);expect(p.concealed).toHaveLength(14);expect(p.tagIds.some(id=>added.tags.find(t=>t.id===id)?.name==='サンプル')).toBe(true);}
  const p03=added.problems.find(p=>p.title.includes('03 '));expect(p03.acceptedDiscards).toEqual(['2s']);expect(p03.explanation).toContain('外側');
  await page.locator('.sample-backups > summary').click();await sizes('fresh-added-backup');
  await page.getByRole('link',{name:'学習帳',exact:true}).click();
  await expect(page.locator('.problem-card')).toHaveCount(10);await expect(page.locator('.problem-card .is-correct')).toHaveCount(0);await sizes('catalog-library');
  await page.locator('.problem-card').filter({hasText:p03.title}).click();
  await expect(page.getByText(p03.explanation,{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'正解・解説を表示',exact:true}).click();await expect(page.getByText(p03.explanation,{exact:true})).toBeVisible();await sizes('sample03-answer');
  await page.locator('.detail-tools > summary').click();
  await expect(page.getByRole('button',{name:'PNG保存',exact:true})).toHaveCount(0);
  await expect(page.locator('.png-preview')).toHaveCount(0);
  await page.getByRole('link',{name:'テスト',exact:true}).click();await expect(page.getByLabel('正解ありのみ',{exact:true})).toHaveCount(0);
  await expect(page.locator('.count-pill')).toContainText('8 問');await capture('answer-only-eight');
  await page.getByRole('spinbutton',{name:'問題数',exact:true}).fill('8');await page.getByRole('button',{name:'8 問でテスト開始',exact:true}).click();
  const answered=[];
  for(let i=0;i<8;i++){
    const title=await page.locator('.test-title').textContent();const problem=added.problems.find(p=>p.title===title);expect(problem.answerEnabled).toBe(true);
    await expect(page.locator('.hand-stage .is-correct')).toHaveCount(0);
    await page.locator('.hand-stage').getByRole('button',{name:label(problem.acceptedDiscards[0]),exact:true}).first().click();
    await page.getByRole('button',{name:'回答する',exact:true}).click();await expect(page.locator('.verdict')).toHaveText('正解');
    if(problem.id===p03.id)await capture('sample03-test-correct');answered.push(problem.id);
    await page.getByRole('button',{name:i===7?'結果を見る':'次の問題へ',exact:true}).click();
  }
  expect(new Set(answered).size).toBe(8);results.push({name:'all-eight-answered',count:answered.length,sample03Correct:answered.includes(p03.id)});
  await fresh.close();

  const legacy=await open(legacyFixture);await sampleSettings();
  await expect(page.locator('.sample-candidates input')).toHaveCount(2);
  expect(await page.locator('.sample-candidates input').evaluateAll(inputs=>inputs.some(el=>el.checked))).toBe(false);
  await sizes('legacy-candidates');
  for(const input of await page.locator('.sample-candidates input').all())await input.check();
  await page.getByRole('button',{name:'旧2題を削除して10題を追加',exact:true}).click();
  const updated=await stored();expect(updated.problems).toHaveLength(12);
  expect(updated.problems.find(p=>p.id==='edited-old')).toEqual(oldEdited);expect(updated.problems.find(p=>p.id==='own')).toEqual(ownProblem);
  expect(updated.problems.some(p=>p.id==='old-one'||p.id==='old-two')).toBe(false);
  await page.reload();await page.getByRole('tab',{name:'データ管理',exact:true}).click();await page.locator('.sample-catalog > summary').click();
  expect((await stored()).problems).toHaveLength(12);
  await page.locator('.sample-backups > summary').click();await sizes('legacy-updated');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'更新前のJSON',exact:true}).click();
  const download=await downloadPromise;await download.saveAs(`${evidence}synthetic-before-update.json`);
  expect(JSON.parse(await readFile(`${evidence}synthetic-before-update.json`,'utf8'))).toEqual(legacyFixture);
  await page.getByRole('button',{name:'更新前の問題を復元',exact:true}).click();
  const restored=await stored();expect(restored.problems).toHaveLength(4);
  for(const p of legacyFixture.problems)expect(restored.problems.find(x=>x.id===p.id)).toEqual(p);
  expect(restored.study.find(s=>s.problemId==='old-one').confirmationCount).toBe(2);
  await expect(page.getByRole('button',{name:'復元済み',exact:true})).toBeDisabled();await sizes('legacy-restored');
  await legacy.close();
  expect(errors).toEqual([]);
  await writeFile(`${evidence}sample-results.json`,JSON.stringify({status:'pass',results,errors},null,2));
  console.log(JSON.stringify({status:'pass',sampleChecks:results.length,errors}));
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:`${evidence}failure.png`,fullPage:true,animations:'disabled'});await writeFile(`${evidence}sample-results.json`,JSON.stringify({status:'fail',message:String(error),results,errors},null,2));throw error;}
finally{await browser.close();}
