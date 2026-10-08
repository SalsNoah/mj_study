import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { TestRouter } from '@/test/TestRouter';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { emptyStore, STORAGE_KEY, type Store } from '@/domain/types';
import { LocalStorageRepository } from '@/storage/repository';
import { DetailPage } from '@/features/detail/DetailPage';
import { EditorPage } from '@/features/editor/EditorPage';
import { LibraryPage } from './LibraryPage';

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); sessionStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function RoutesUnderTest() {
  const location = useLocation(), navigate = useNavigate();
  return <><output id="path">{location.pathname}</output><Link to="/">作成へ</Link><Link to="/library">一覧へ</Link>
    <button onClick={() => navigate(-1)}>戻る</button><button onClick={() => navigate(1)}>進む</button>
    <Routes><Route path="/" element={<EditorPage />} /><Route path="/library" element={<LibraryPage />} />
      <Route path="/problems/:id" element={<DetailPage />} /><Route path="/edit/:id" element={<EditorPage />} /></Routes></>;
}
async function mount(path = '/problems/old') {
  const data = emptyStore(); data.problems = [{ ...createLegacySampleProblems().problems[0]!, id: 'old', title: '前の問題' }];
  data.study = [{problemId:'old',contentRevision:2,confirmationCount:3,lastConfirmedAt:null,understanding:'understood',lastReviewedAt:null,lastSolvedAt:null,lastCorrectAt:null,inTest:true}];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  await act(async () => root.render(<AppProvider><TestRouter initialEntries={[path]}><RoutesUnderTest /></TestRouter></AppProvider>));
  return data;
}
const stored = (): Store => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
const path = () => host.querySelector('#path')!.textContent;
function button(label: string) { const el = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label); if(!el)throw Error(label);return el; }
async function click(el: HTMLElement) { await act(async()=>el.click()); }
async function input(el: HTMLInputElement, value: string) { await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}); }
async function newDraft() {
  await input(host.querySelector<HTMLInputElement>('.editor-title-input') ?? host.querySelector<HTMLInputElement>('input[maxlength="100"]')!, '新しい問題');
  await click(host.querySelector<HTMLButtonElement>('.tile-palette button[aria-label="一萬"]')!);
  await click(host.querySelector<HTMLButtonElement>('.hand-stage--pick button[aria-label="一萬"]')!);
}
it('records confirmation once, returns to the library, and retains one-shot undo', async()=>{
  const before=await mount();const spy=vi.spyOn(LocalStorageRepository.prototype,'confirmProblem');const confirm=button('確認した（問題一覧に戻る）');
  await act(async()=>{confirm.click();confirm.click();});
  expect(path()).toBe('/library');expect(spy).toHaveBeenCalledTimes(1);expect(stored().study[0]!.confirmationCount).toBe(4);
  expect(stored().problems).toEqual(before.problems);expect(stored().attempts).toEqual(before.attempts);
  expect(Object.values(stored().daily!)[0]!.confirmed).toBe(1);
  const undo=button('取り消す');await act(async()=>{undo.click();undo.click();});
  expect(stored().study).toEqual(before.study);expect(Object.values(stored().daily!)[0]!.confirmed).toBe(0);
  await click(button('戻る'));await click(button('進む'));expect(host.textContent).not.toContain('取り消す');expect(stored().study[0]!.confirmationCount).toBe(3);
});
it('keeps the detail and saved data on confirmation failure, then permits retry', async()=>{
  await mount();const raw=localStorage.getItem(STORAGE_KEY);
  const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('full','QuotaExceededError');});
  await click(button('確認した（問題一覧に戻る）'));expect(path()).toBe('/problems/old');expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);expect(host.querySelector('.detail-confirm-dock [role="alert"]')).not.toBeNull();
  fail.mockRestore();await click(button('確認した（問題一覧に戻る）'));expect(path()).toBe('/library');expect(stored().study[0]!.confirmationCount).toBe(4);
});
it('expires undo after five seconds without losing the recorded confirmation',async()=>{
  await mount();vi.useFakeTimers();await click(button('確認した（問題一覧に戻る）'));expect(button('取り消す')).toBeTruthy();
  await act(async()=>vi.advanceTimersByTime(5001));expect(host.textContent).not.toContain('取り消す');expect(stored().study[0]!.confirmationCount).toBe(4);
});
it('keeps an undo save failure visible and permits retry within its window',async()=>{
  await mount();await click(button('確認した（問題一覧に戻る）'));const raw=localStorage.getItem(STORAGE_KEY);
  const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('full','QuotaExceededError');});
  await click(button('取り消す'));expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);expect(host.querySelector('[role="alert"]')).not.toBeNull();
  fail.mockRestore();await click(button('取り消す'));expect(stored().study[0]!.confirmationCount).toBe(3);
});
it('saves a new problem once and shows it in the unfiltered library',async()=>{
  await mount('/library');await input(host.querySelector<HTMLInputElement>('input[type="search"]')!,'存在しない検索');
  expect(host.querySelector('.problem-card')).toBeNull();await click(host.querySelector<HTMLAnchorElement>('a[href="/"]')!);await newDraft();
  const spy=vi.spyOn(LocalStorageRepository.prototype,'saveProblem');const save=button('保存');await act(async()=>{save.click();save.click();});
  expect(path()).toBe('/library');expect(spy).toHaveBeenCalledTimes(1);expect(stored().problems).toHaveLength(2);
  expect(host.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('');expect(host.querySelectorAll('.problem-card')).toHaveLength(2);
  expect(host.querySelector('.problem-card')!.textContent).toContain('新しい問題');expect(host.querySelector('[role="dialog"]')).toBeNull();
});
it('retains new drafts after failed saves and keeps the unsaved navigation guard',async()=>{
  await mount('/');await newDraft();const raw=localStorage.getItem(STORAGE_KEY);
  const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('full','QuotaExceededError');});
  await click(button('保存'));expect(path()).toBe('/');expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);fail.mockRestore();
  await click(host.querySelector<HTMLAnchorElement>('a[href="/library"]')!);expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await click(button('この画面に残る'));expect(path()).toBe('/');await click(button('保存'));expect(path()).toBe('/library');
});
it('keeps existing-edit saves returning to their detail without confirming',async()=>{
  const before=await mount('/edit/old');await click(button('保存'));expect(path()).toBe('/problems/old');
  expect(stored().study).toEqual(before.study);expect(stored().daily).toEqual(before.daily);
});

it('undoes the confirmation day when the five-second window crosses midnight',async()=>{
  await mount();vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,7,23,59,59));await click(button('確認した（問題一覧に戻る）'));
  await act(async()=>vi.advanceTimersByTime(2000));await click(button('取り消す'));
  expect(stored().daily!['2026-10-07']!.confirmed).toBe(0);expect(stored().daily!['2026-10-08']).toBeUndefined();
  expect(stored().study[0]!.confirmationCount).toBe(3);
});
