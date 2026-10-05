import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { emptyStore, STORAGE_KEY } from '@/domain/types';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { SettingsPage } from './SettingsPage';
import { TestPage } from '@/features/test/TestPage';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); sessionStorage.clear();
  host=document.createElement('div'); document.body.append(host); root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function mount(){await act(async()=>root.render(<AppProvider><MemoryRouter><Link to="/test">テストへ</Link><Routes><Route path="/" element={<SettingsPage/>}/><Route path="/test" element={<TestPage/>}/></Routes></MemoryRouter></AppProvider>));}
const button=(text:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;
const stored=()=>JSON.parse(localStorage.getItem(STORAGE_KEY)!);
async function click(element:HTMLElement){await act(async()=>element.click());}
async function samples(){await click(button('データ管理'));await click(host.querySelector<HTMLElement>('.sample-catalog > summary')!);}

it('starts empty, adds ten samples only on request, and supplies exactly eight answer-enabled test candidates',async()=>{
  await mount();expect(localStorage.getItem(STORAGE_KEY)).toBeNull();await samples();
  await click(button('サンプル10題を追加'));
  const data=stored();expect(data.problems).toHaveLength(10);expect(data.problems.filter((p:{answerEnabled:boolean})=>p.answerEnabled)).toHaveLength(8);
  const sampleTag=data.tags.find((t:{name:string})=>t.name==='サンプル');expect(sampleTag).toBeTruthy();
  for(const p of data.problems){expect(p.tagIds).toContain(sampleTag.id);expect(p.drawn).toBeNull();expect(p.concealed).toHaveLength(14);}
  expect(button('この10題は追加済み').disabled).toBe(true);
  await click(host.querySelector<HTMLAnchorElement>('a')!);
  expect(host.textContent).not.toContain('正解ありのみ');
  expect(host.querySelector('.count-pill')!.textContent).toContain('8 問');
});

it('requires explicit legacy selection, preserves other records, and restores through the visible recovery action',async()=>{
  const data=emptyStore();const legacy=createLegacySampleProblems().problems;
  data.tags=[{id:'sample-tag',name:'サンプル'}];
  data.problems=legacy.map(p=>({...p,tagIds:['sample-tag']}));
  const edited={...data.problems[0]!,id:'edited',privateMemo:'自分の追記'};data.problems.push(edited);
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));await mount();await samples();
  const candidates=[...host.querySelectorAll<HTMLInputElement>('.sample-candidates input')];expect(candidates).toHaveLength(2);expect(candidates.every(i=>!i.checked)).toBe(true);
  await click(candidates[0]!);await click(button('旧1題を削除して10題を追加'));
  expect(stored().problems).toHaveLength(12);expect(stored().problems.find((p:{id:string})=>p.id===edited.id)).toEqual(edited);
  expect(stored().problems.find((p:{id:string})=>p.id===legacy[1]!.id)).toEqual(data.problems[1]);
  await click(host.querySelector<HTMLElement>('.sample-backups > summary')!);await click(button('更新前の問題を復元'));
  expect(stored().problems).toHaveLength(3);
  for(const p of data.problems)expect(stored().problems.find((x:{id:string})=>x.id===p.id)).toEqual(p);
  expect(button('復元済み').disabled).toBe(true);
});

it('bulk-selects old candidates, keeps edited and self-created records, and restores the original snapshot',async()=>{
  const data=emptyStore();const legacy=createLegacySampleProblems().problems;
  data.tags=[{id:'sample-tag',name:'サンプル'}];
  data.problems=legacy.map(p=>({...p,tagIds:['sample-tag']}));
  data.problems.push({...data.problems[0]!,id:'edited-bulk',privateMemo:'編集した内容'});
  data.problems.push({...data.problems[1]!,id:'own-bulk',title:'自作の問題'});
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));await mount();await samples();
  const original=localStorage.getItem(STORAGE_KEY);
  await click(button('旧候補をまとめて選択'));
  expect(localStorage.getItem(STORAGE_KEY)).toBe(original);
  expect(host.querySelectorAll('.sample-candidates input:checked')).toHaveLength(2);
  await click(button('旧2題を削除して10題を追加'));
  expect(stored().problems).toHaveLength(12);
  for(const p of data.problems.slice(2))expect(stored().problems.find((x:{id:string})=>x.id===p.id)).toEqual(p);
  await click(host.querySelector<HTMLElement>('.sample-backups > summary')!);await click(button('更新前の問題を復元'));
  expect(stored().problems).toHaveLength(4);
  for(const p of data.problems)expect(stored().problems.find((x:{id:string})=>x.id===p.id)).toEqual(p);
});
