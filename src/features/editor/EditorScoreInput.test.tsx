import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { EditorPage } from './EditorPage';
import { putImportDraft } from '@/features/import/draft';
import { emptyContext, emptyStore, STORAGE_KEY } from '@/domain/types';
import { createSampleProblems } from '@/data/samples';
let host: HTMLDivElement; let root: Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);localStorage.clear();sessionStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function mount(path='/'){await act(async()=>root.render(<AppProvider><MemoryRouter initialEntries={[path]}><Routes><Route path="/" element={<EditorPage/>}/><Route path="/edit/:id" element={<EditorPage/>}/><Route path="/problems/:id" element={<div>saved</div>}/></Routes></MemoryRouter></AppProvider>));}
const field=(label:string)=>[...host.querySelectorAll<HTMLInputElement>('.ctx-score input')].find(el=>el.getAttribute('aria-label')!.startsWith(label+'の点数'))!;
const button=(text:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(el=>el.textContent?.trim()===text)!;
async function click(el:HTMLElement){await act(async()=>el.click());}
async function input(label:string,value:string){const el=field(label);await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
async function addHand(){await click(host.querySelector<HTMLElement>('.tile-palette button[aria-label="一萬"]')!);}
const saved=()=>JSON.parse(localStorage.getItem(STORAGE_KEY)!).problems[0];
it('shows fixed 00 and saves zero, maximum prefix, blank and negative scores',async()=>{
 await mount();expect(field('東').value).toBe('250');expect([...host.querySelectorAll('.score-suffix')].map(el=>el.textContent)).toEqual(['00','00','00','00']);
 await input('東','0');await input('南','999');await input('西','');await input('北','-25');await addHand();await click(button('保存'));
 expect(saved().context.scores).toEqual({east:0,south:99900,west:null,north:-2500});
});
it('does not truncate a paste or save the last-valid value while an invalid draft is present',async()=>{
 await mount();await addHand();await input('東','25000');expect(field('東').value).toBe('25000');expect(field('東').getAttribute('aria-invalid')).toBe('true');expect(button('詳細入力').disabled).toBe(true);
 for(const invalid of ['25000','-','1.5','1e2','1000']){await input('東',invalid);await click(button('保存'));expect(localStorage.getItem(STORAGE_KEY)).toBeNull();}
 await input('東','275');await click(button('保存'));expect(saved().context.scores.east).toBe(27500);
});
it('preserves legacy remainders and large/negative values through both modes and save',async()=>{
 const store=emptyStore();const p=createSampleProblems().problems[0]!;const scores={east:12345,south:-25000,west:100000,north:-100000};store.problems=[{...p,id:'old',context:{...p.context,scores}}];localStorage.setItem(STORAGE_KEY,JSON.stringify(store));await mount('/edit/old');
 expect(field('東').value).toBe('12345');expect(field('南').value).toBe('-250');expect(field('西').value).toBe('100000');expect(field('北').value).toBe('-100000');
 await click(button('詳細入力'));expect(field('南').value).toBe('-25000');await click(button('3桁＋00に戻す'));expect(field('南').value).toBe('-250');expect(field('東').value).toBe('12345');
 await click(button('保存'));expect(saved().context.scores).toEqual(scores);
});
it('allows exact legacy bounds and preserves new non-hundred values when returning to compact mode',async()=>{
 await mount();expect(button('詳細入力').getAttribute('aria-pressed')).toBe('false');await click(button('詳細入力'));expect(button('3桁＋00に戻す').getAttribute('aria-pressed')).toBe('true');await input('東','99999');await input('南','200000');await input('西','-100000');await click(button('3桁＋00に戻す'));
 expect(field('東').value).toBe('99999');expect(field('東').getAttribute('aria-label')).toContain('そのまま');await addHand();await click(button('保存'));
 expect(saved().context.scores).toEqual({east:99999,south:200000,west:-100000,north:25000});
});
it('normalizes exact input on blur only when the value is representable and valid',async()=>{
 const store=emptyStore();const p=createSampleProblems().problems[0]!;store.problems=[{...p,id:'old',context:{...p.context,scores:{east:12345,south:null,west:null,north:null}}}];localStorage.setItem(STORAGE_KEY,JSON.stringify(store));await mount('/edit/old');
 await input('東','12300');await act(async()=>field('東').dispatchEvent(new FocusEvent('focusout',{bubbles:true})));expect(field('東').value).toBe('123');expect(field('東').getAttribute('aria-label')).toContain('百点単位');
 await input('東','1000');await act(async()=>field('東').dispatchEvent(new FocusEvent('focusout',{bubbles:true})));expect(field('東').value).toBe('1000');expect(field('東').getAttribute('aria-invalid')).toBe('true');
 await input('東','123');await click(button('保存'));expect(saved().context.scores.east).toBe(12300);
});
it('preserves OCR score remainders, zero, blank, negative and indicator data',async()=>{
 const scores={east:25150,south:0,west:null,north:-1200};putImportDraft({concealed:['1m'],melds:[],doraIndicators:['2m'],context:{...emptyContext(),scores}});await mount();
 expect(['東','南','西','北'].map(label=>field(label).value)).toEqual(['25150','0','','-12']);await click(button('保存'));expect(saved().context.scores).toEqual(scores);expect(saved().doraIndicators).toEqual(['2m']);
});
it('explicitly adopts a full point value or restores the prior valid value and returns keyboard focus',async()=>{
 await mount();await addHand();await input('東','300');await input('東','25000');const adopt=button('25,000点として反映');expect(adopt.getAttribute('aria-label')).toBe('東の点数を25,000点として反映');await act(async()=>adopt.focus());await click(adopt);expect(field('東').value).toBe('250');expect(document.activeElement).toBe(field('東'));
 await input('南','275');await input('南','1.5');const reset=host.querySelector<HTMLElement>('button[aria-label="南の未反映入力を戻す"]')!;await act(async()=>reset.focus());await click(reset);expect(field('南').value).toBe('275');expect(document.activeElement).toBe(field('南'));
 await click(button('保存'));expect(saved().context.scores).toMatchObject({east:25000,south:27500});
});

it('preserves invalid OCR values visibly and blocks save until each score is corrected',async()=>{
 putImportDraft({concealed:['1m'],melds:[],doraIndicators:[],context:{...emptyContext(),scores:{east:200001,south:-100001,west:1.5,north:null}}});await mount();
 expect(['東','南','西'].map(label=>field(label).value)).toEqual(['200001','-100001','1.5']);
 for(const label of ['東','南','西']) expect(field(label).getAttribute('aria-invalid')).toBe('true');
 expect(host.querySelectorAll('.score-input-error')).toHaveLength(3);await click(button('保存'));expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
 await input('東','200000');await input('南','-100000');await input('西','100');await click(button('保存'));
 expect(saved().context.scores).toEqual({east:200000,south:-100000,west:100,north:null});
});
