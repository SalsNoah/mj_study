import { TestRouter as MemoryRouter } from '@/test/TestRouter';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { EditorPage } from './EditorPage';
import { createLegacySampleProblems as createSampleProblems } from '@/data/legacySamples';
import { emptyStore, STORAGE_KEY, LIMITS, type Store, type Problem } from '@/domain/types';
let host:HTMLDivElement;let root:Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);localStorage.clear();sessionStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function mount(path='/'){await act(async()=>root.render(<AppProvider><MemoryRouter initialEntries={[path]}><Routes><Route path="/" element={<EditorPage/>}/><Route path="/edit/:id" element={<EditorPage/>}/><Route path="/problems/:id" element={<div>saved</div>}/></Routes></MemoryRouter></AppProvider>));}
const title=()=>host.querySelector<HTMLInputElement>('.editor-title input')!;
const notes=()=>host.querySelector<HTMLDetailsElement>('.editor-notes')!;
const save=()=>host.querySelector<HTMLButtonElement>('.editor-save')!;
async function click(el:HTMLElement){await act(async()=>el.click());}
async function fill(el:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
it('keeps one accessible title beside the heading and before header actions with notes closed',async()=>{
 await mount();expect(notes().open).toBe(true);await click(notes().querySelector('summary')!);expect(notes().open).toBe(false);expect(title().closest('header')).not.toBeNull();expect(notes().querySelector('.editor-title')).toBeNull();expect(host.querySelectorAll('.editor-title input')).toHaveLength(1);
 const header=title().closest('header')!;expect([...header.children].map(el=>el.tagName)).toEqual(['H1','LABEL','DIV']);
 expect(title().parentElement!.textContent).toBe('タイトル（任意）');expect(title().maxLength).toBe(LIMITS.title);
 await fill(title(),'開かずに付けた題名');await click(host.querySelector<HTMLElement>('.tile-palette button[aria-label="一萬"]')!);
 await click(notes().querySelector('summary')!);await click(host.querySelector<HTMLElement>('.hand-stage--pick button[aria-label="一萬"]')!);await click(notes().querySelector('summary')!);await click(save());
 expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).problems[0].title).toBe('開かずに付けた題名');
});
it('preserves the header title and input node through notes open/close and hand edits',async()=>{
 await mount();const input=title();await fill(input,'編集中のタイトル');
 for(let i=0;i<2;i++)await click(notes().querySelector('summary')!);
 await click(host.querySelector<HTMLElement>('.tile-palette button[aria-label="二萬"]')!);
 expect(title()).toBe(input);expect(title().value).toBe('編集中のタイトル');expect(host.querySelector('.editor-workspace')!.firstElementChild?.className).toBe('editor-main');
});
it.each(['understood', 'uncertain'] as const)('preserves %s learning state and history when saving only a legacy problem title',async(understanding)=>{
 const store=emptyStore();
 const p:Problem={...createSampleProblems().problems[0]!,id:'edit-title',title:'既存タイトル',
   concealed:['7s','6s','5s','4p','3p','2p','8m','7m','6m','0m','4m','3m','2m'],drawn:'1z',
   sample:{catalogId:'legacy',version:'1',itemId:'sample-title',fingerprint:'original'}};
 const at='2026-10-01T10:00:00.000Z';
 store.settings.autoSort=understanding==='understood';
 store.problems=[p];
 store.study=[{problemId:p.id,contentRevision:3,confirmationCount:4,understanding,lastReviewedAt:at,
   lastConfirmedAt:at,lastSolvedAt:at,lastCorrectAt:at,inTest:false}];
 store.attempts=[{id:'attempt-title',problemId:p.id,contentRevision:3,sessionId:'session-title',questionIndex:0,
   at,selectedTile:'1z',result:'correct'}];
 store.daily={'2026-10-01':{tested:1,confirmed:4}};
 const raw=JSON.stringify(store);localStorage.setItem(STORAGE_KEY,raw);await mount('/edit/edit-title');
 expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
 expect(host.querySelector('h1')!.textContent).toBe('問題を編集');expect(title().value).toBe('既存タイトル');expect(notes().open).toBe(true);
 await fill(title(),'編集後タイトル');await click(save());
 expect(host.textContent).toBe('saved');
 const stored:Store=JSON.parse(localStorage.getItem(STORAGE_KEY)!);
 expect(stored.problems).toHaveLength(1);
 expect(stored.problems[0]).toEqual({...p,title:'編集後タイトル',drawn:null,
   concealed:['2m','3m','4m','0m','6m','7m','8m','2p','3p','4p','5s','6s','7s','1z'],
   updatedAt:expect.any(String)});
 expect(stored.study).toEqual(store.study);
 expect(stored.attempts).toEqual(store.attempts);
 expect(stored.daily).toEqual(store.daily);
 expect(stored.schemaVersion).toBe(store.schemaVersion);
});
it('focuses an invalid title without opening notes or saving it',async()=>{
 await mount();await click(notes().querySelector('summary')!);await click(host.querySelector<HTMLElement>('.tile-palette button[aria-label="一萬"]')!);await fill(title(),'長'.repeat(LIMITS.title+1));await click(save());
 expect(document.activeElement).toBe(title());expect(notes().open).toBe(false);expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});
