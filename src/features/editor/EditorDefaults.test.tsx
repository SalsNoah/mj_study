import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { EditorPage } from './EditorPage';
import { putImportDraft } from '@/features/import/draft';
import { emptyContext, emptyStore, STORAGE_KEY } from '@/domain/types';
import { createSampleProblems } from '@/data/samples';
import { remainingLimits } from '@/domain/remaining';
import { NORMAL_TILES } from '@/domain/ukeire';

let host: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.clear(); sessionStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function mount(path = '/') { await act(async () => root.render(<AppProvider><MemoryRouter initialEntries={[path]}><Routes><Route path="/" element={<EditorPage />} /><Route path="/edit/:id" element={<EditorPage />} /><Route path="/problems/:id" element={<div>saved</div>} /></Routes></MemoryRouter></AppProvider>)); }
async function click(element: HTMLElement) { await act(async () => element.click()); }
const values = () => [...host.querySelectorAll<HTMLInputElement>('.ctx-score input')].map(input => input.value);

it('starts only a new manual problem with east 1/east seat/turn 6/25000 and a north indicator', async () => {
  await mount();
  expect(host.querySelector<HTMLSelectElement>('[aria-label="局"]')!.value).toBe('1');
  expect(host.querySelector<HTMLSelectElement>('[aria-label="巡目"]')!.value).toBe('6');
  expect([...host.querySelectorAll('.ctx-toolbar .seg')].map(group => group.querySelector('.is-on')!.textContent)).toEqual(['東', '東']);
  expect(values()).toEqual(['25000','25000','25000','25000']);
  expect(host.querySelectorAll('.wanpai .tile-btn[aria-label="北"]')).toHaveLength(1);
  const north = host.querySelector<HTMLButtonElement>('.tile-palette button[aria-label="北"]')!;
  for (let count = 0; count < 3; count++) await click(north);
  expect(north.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('.tile-palette button[aria-label="東"]')!.disabled).toBe(false);
  await click([...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '保存')!);
  const problem = JSON.parse(localStorage.getItem(STORAGE_KEY)!).problems[0];
  expect(problem.doraIndicators).toEqual(['4z']);
  expect(problem.context).toMatchObject({ roundWind: '1z', handNumber: 1, seatWind: '1z', turn: 6, scores: { east: 25000, south: 25000, west: 25000, north: 25000 } });
  expect(remainingLimits(problem)[NORMAL_TILES.indexOf('4z')]).toBe(0);
  expect(remainingLimits(problem)[NORMAL_TILES.indexOf('1z')]).toBe(4);
});

it('does not fill defaults into an existing problem with empty conditions or indicators', async () => {
  const store = emptyStore();
  const problem = createSampleProblems().problems[0]!;
  store.problems = [{ ...problem, id: 'existing', context: emptyContext(), doraIndicators: [] }];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  await mount('/edit/existing');
  expect(host.querySelector<HTMLSelectElement>('[aria-label="局"]')!.value).toBe('');
  expect(host.querySelector<HTMLSelectElement>('[aria-label="巡目"]')!.value).toBe('');
  expect(values()).toEqual(['','','','']);
  expect(host.querySelector('.wanpai .tile-btn[aria-label="北"]')).toBeNull();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).problems[0].context).toEqual(emptyContext());
});

it('preserves imported or OCR conditions and an explicitly empty indicator list', async () => {
  putImportDraft({ concealed: ['1m'], melds: [], doraIndicators: [], context: { ...emptyContext(), turn: 3, scores: { east: 31000, south: 18000, west: 25000, north: 26000 } } });
  await mount();
  expect(host.querySelector<HTMLSelectElement>('[aria-label="局"]')!.value).toBe('');
  expect(host.querySelector<HTMLSelectElement>('[aria-label="巡目"]')!.value).toBe('3');
  expect(values()).toEqual(['31000','18000','25000','26000']);
  expect(host.querySelector('.wanpai .tile-btn[aria-label="北"]')).toBeNull();
});
