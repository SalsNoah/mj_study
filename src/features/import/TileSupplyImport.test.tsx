import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ImportPage} from './ImportPage';
import {setPendingShot,peekImportDraft} from './draft';
const mock=vi.hoisted(()=>({result:null as any,badRematch:false,remember:vi.fn()}));
vi.mock('./autoRead',()=>({GAME_NAMES:{jantama:'雀魂'},loadLocalBanks:()=>({}),loadModel:async()=>({}),prepareModel:()=>({jantama:{tiles:[]}}),autoRead:()=>structuredClone(mock.result),rememberTile:mock.remember,rematchCell:(c:any)=>mock.badRematch?{...c,label:'1m',sure:true}:c}));
vi.mock('./recognize',()=>({loadImage:async()=>({img:{},url:'blob:fixture'})}));
let host:HTMLDivElement,root:Root;
const cell=(label:string,sure=true)=>({label,sure,feat:new Uint8Array(0),preview:'data:image/png;base64,',rotated:false});
beforeEach(()=>{sessionStorage.clear();localStorage.clear();mock.badRematch=false;mock.remember.mockClear();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('URL',Object.assign(class extends URL {},{revokeObjectURL:vi.fn()}));host=document.createElement('div');document.body.append(host);root=createRoot(host);mock.result={game:'jantama',hand:[],melds:[],dora:[],roundWind:null,handNumber:null,honba:null,riichiSticks:null,seatWind:null,turn:null,players:4,scores:{self:null,right:null,across:null,left:null},estimated:[]};});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function mount(){setPendingShot(new Blob(['fixture']));await act(async()=>root.render(<MemoryRouter initialEntries={['/import']}><Routes><Route path="/import" element={<ImportPage/>}/><Route path="/" element={<div>editor</div>}/></Routes></MemoryRouter>));await act(async()=>{await new Promise(r=>setTimeout(r,70));});}
async function click(e:HTMLElement){await act(async()=>e.click());}
const tile=(name:string)=>host.querySelector<HTMLButtonElement>(`.tile-palette button[aria-label="${name}"]`)!;
it('rejects all-sure OCR overflow without deleting it, then permits replacement excluding the selected tile',async()=>{
mock.result.hand=Array.from({length:5},()=>cell('1m'));await mount();expect(peekImportDraft()).toBeNull();expect(host.querySelectorAll('.read-cell')).toHaveLength(5);expect(host.textContent).toContain('最大4枚');await click(host.querySelector<HTMLElement>('.read-cell')!);expect(tile('一萬').disabled).toBe(true);expect(tile('二萬').disabled).toBe(false);await click(tile('二萬'));expect(mock.remember).toHaveBeenCalledTimes(1);const create=[...host.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent==='この内容で作成')!;await click(create);expect(peekImportDraft()!.concealed).toEqual(['2m','1m','1m','1m','1m']);
});
it('known dora/melds constrain correction and automatic reread cannot reintroduce overflow',async()=>{
mock.result.hand=[cell('2m',false),cell('3m')];mock.result.melds=[[cell('1m'),cell('1m'),cell('1m')]];mock.result.dora=[cell('1m')];mock.badRematch=true;await mount();expect(tile('一萬').disabled).toBe(true);expect(tile('二萬').disabled).toBe(false);await click(tile('二萬'));expect(host.querySelectorAll('[aria-label="読み取り結果 1m"]')).toHaveLength(4);expect(host.querySelectorAll('[aria-label="読み取り結果 2m"]')).toHaveLength(1);expect(host.querySelectorAll('[aria-label="読み取り結果 3m"]')).toHaveLength(1);expect(mock.remember).toHaveBeenCalledTimes(1);
});
it('does not auto-draft an ambiguous four-tile kan even when every label is sure',async()=>{
mock.result.hand=[cell('9s')];mock.result.melds=[[{...cell('1z'),rotated:true},cell('1z'),cell('1z'),cell('1z')]];
await mount();expect(peekImportDraft()).toBeNull();expect(host.textContent).toContain('槓の種類を判定できません');expect(host.querySelectorAll('.read-cell')).toHaveLength(5);
const create=[...host.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent==='この内容で作成')!;
await click(create);expect(peekImportDraft()).toBeNull();expect(host.querySelectorAll('.read-cell')).toHaveLength(5);
const confirm=[...host.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent==='重なりなし・横向き1枚の大明槓と確認')!;
await click(confirm);await click([...host.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent==='この内容で作成')!);
expect(peekImportDraft()!.melds[0]).toMatchObject({type:'openKan',tiles:['1z','1z','1z','1z'],from:'left'});
});
it('passes proven added-kan identity, order and red tile into the editor draft',async()=>{
const observed=(label:string,rotated=false,stack:any='none')=>({...cell(label),rotated,meldEvidence:{source:'manualConfirmation',face:'front',orientation:rotated?'sideways':'upright',stack}});
mock.result.hand=[cell('9s')];mock.result.melds=[[observed('5p'),observed('5p',true,{pairId:'fixture',level:'lower'}),observed('0p',true,{pairId:'fixture',level:'upper'}),observed('5p')]];
await mount();expect(peekImportDraft()!.melds).toHaveLength(1);expect(peekImportDraft()!.melds[0]).toMatchObject({type:'addedKan',tiles:['5p','5p','5p','0p'],from:'opposite',calledIndex:1,addedIndex:1});expect(host.textContent).toBe('editor');
});
