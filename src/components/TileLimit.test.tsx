import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { EditorPage } from '@/features/editor/EditorPage';
import { putImportDraft } from '@/features/import/draft';
import { STORAGE_KEY, emptyContext, emptyStore } from '@/domain/types';
let host: HTMLDivElement; let root: Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);localStorage.clear();sessionStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const click=async(e:HTMLElement)=>{await act(async()=>e.click());};
function button(text:string){const b=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text);if(!b)throw Error('missing '+text);return b;}
function tile(name:string){return host.querySelector<HTMLButtonElement>(`.tile-palette button[aria-label="${name}"]`)!;}
async function mount(){await act(async()=>root.render(<AppProvider><MemoryRouter><Routes><Route path="/" element={<EditorPage/>}/><Route path="/problems/:id" element={<div>saved</div>}/></Routes></MemoryRouter></AppProvider>));}

it('blocks fifth clicks immediately, restores availability after removal and undo',async()=>{
 await mount();for(let n=0;n<4;n++)await click(tile('一萬'));expect(tile('一萬').disabled).toBe(true);
 for(let n=0;n<8;n++)await click(tile('一萬'));expect(host.querySelectorAll('.tile-input .hand-stage .tile-btn[aria-label="一萬"]')).toHaveLength(4);
 expect(tile('一萬').getAttribute('aria-description')).toContain('最大4枚');
 await click(host.querySelector<HTMLElement>('.hand-stage .tile-btn[aria-label="一萬"]')!);expect(tile('一萬').disabled).toBe(false);
 await click(button('戻す'));expect(tile('一萬').disabled).toBe(true);await click(host.querySelector<HTMLElement>('.hand-stage--pick .tile-btn[aria-label="一萬"]')!);await click(button('保存'));expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).problems[0].concealed).toHaveLength(4);
});
it('shares red and ordinary limits and permits other suits',async()=>{
 await mount();await click(tile('赤五萬'));expect(tile('赤五萬').disabled).toBe(true);for(let n=0;n<3;n++)await click(tile('五萬'));expect(tile('五萬').disabled).toBe(true);expect(tile('赤五萬').disabled).toBe(true);expect(tile('赤五筒').disabled).toBe(false);
 await click(button('ドラ表示牌'));expect(tile('五萬').disabled).toBe(true);await click(tile('赤五筒'));await click(button('手牌'));expect(tile('赤五筒').disabled).toBe(true);
});
it('counts all tiles in a proposed meld before confirming and frees supply on meld removal',async()=>{
 await mount();await click(tile('一萬'));await click(tile('一萬'));await click(button('明刻子'));expect(tile('一萬').disabled).toBe(true);await click(button('暗槓子'));expect(tile('一萬').disabled).toBe(true);await click(button('明順子'));expect(tile('一萬').disabled).toBe(false);await click(tile('一萬'));expect(host.querySelectorAll('.meld-btn')).toHaveLength(1);await click(button('手牌'));await click(tile('一萬'));expect(tile('一萬').disabled).toBe(true);
 await click(host.querySelector<HTMLElement>('.meld-btn')!);expect(tile('一萬').disabled).toBe(false);await click(button('戻す'));expect(tile('一萬').disabled).toBe(true);
});
it('kan uses four physical copies and known dora can prevent even a chi anchor',async()=>{
 await mount();await click(button('ドラ表示牌'));for(let i=0;i<4;i++)await click(tile('二萬'));await click(button('明順子'));expect(tile('一萬').disabled).toBe(true);expect(tile('二萬').disabled).toBe(true);await click(button('暗槓子'));await click(tile('五筒'));await click(button('手牌'));expect(tile('五筒').disabled).toBe(true);expect(tile('赤五筒').disabled).toBe(true);
 await click(button('ドラ表示牌'));expect(tile('五筒').disabled).toBe(true);await click(host.querySelector<HTMLElement>('.wanpai .tile-btn[aria-label="二萬"]')!);await click(button('明順子'));expect(tile('一萬').disabled).toBe(false);
});
it('preserves invalid imported tiles for repair and refuses saving until corrected',async()=>{
 putImportDraft({concealed:['1m','1m','1m','1m','1m'],melds:[],doraIndicators:[],context:emptyContext()});await mount();expect(host.querySelectorAll('.hand-stage .tile-btn[aria-label="一萬"]')).toHaveLength(5);expect(host.textContent).toContain('自動で削除していません');await click(button('保存'));expect(host.textContent).toContain('同じ牌が5枚以上');expect(localStorage.getItem(STORAGE_KEY)).toBeNull();await click(host.querySelector<HTMLElement>('.hand-stage .tile-btn[aria-label="一萬"]')!);await click(button('保存'));expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).problems[0].concealed).toHaveLength(4);
});
it('does not trim imported oversized hand on initial load or single removal',async()=>{
 putImportDraft({concealed:Array(16).fill('1m'),melds:[],doraIndicators:['2m','3m','4m','5m','6m','7m'],context:emptyContext()});await mount();expect(host.querySelectorAll('.hand-stage .hand-strip .tile-btn')).toHaveLength(16);await click(host.querySelector<HTMLElement>('.hand-stage .hand-strip .tile-btn')!);expect(host.querySelectorAll('.hand-stage .hand-strip .tile-btn')).toHaveLength(15);await click(button('表示牌6枚目（7m）を削除'));expect(host.textContent).not.toContain('表示牌6枚目');
});

it.each(['明槓子','暗槓子','加槓子'])('%s counts four physical copies for input blocking',async(tab)=>{await mount();await click(tile('一萬'));await click(button(tab));expect(tile('一萬').disabled).toBe(true);expect(tile('二萬').disabled).toBe(false);await click(tile('二萬'));await click(button('手牌'));expect(tile('二萬').disabled).toBe(true);await click(button('戻す'));expect(tile('二萬').disabled).toBe(false);});
it('editing includes an existing drawn tile and preserves invalid data until the user removes it',async()=>{const s=emptyStore();s.problems=[{id:'old',title:'old',concealed:['5m','5m','5m'],drawn:'0m',melds:[],doraIndicators:[],answerEnabled:false,acceptedDiscards:[],explanation:'',privateMemo:'',tagIds:[],context:emptyContext(),attachments:[],sourceUrl:'',createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:00Z'}];localStorage.setItem(STORAGE_KEY,JSON.stringify(s));await act(async()=>root.render(<AppProvider><MemoryRouter initialEntries={['/edit/old']}><Routes><Route path="/edit/:id" element={<EditorPage/>}/></Routes></MemoryRouter></AppProvider>));expect(host.querySelectorAll('.hand-strip .tile-btn')).toHaveLength(4);expect(tile('五萬').disabled).toBe(true);expect(tile('赤五萬').disabled).toBe(true);expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).problems[0].drawn).toBe('0m');});
