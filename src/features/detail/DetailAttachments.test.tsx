import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { emptyStore, STORAGE_KEY, type Store } from '@/domain/types';
import { DetailPage } from './DetailPage';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  sessionStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function fixture() {
  const store = emptyStore();
  const original = createLegacySampleProblems().problems[0]!;
  original.attachments = [
    { id: 'question', role: 'question', dataUrl: 'data:image/png;base64,AQ==', width: 1, height: 1 },
    { id: 'explanation', role: 'explanation', dataUrl: 'data:image/png;base64,Ag==', width: 1, height: 1 },
    { id: 'legacy', dataUrl: 'data:image/png;base64,Aw==', width: 1, height: 1 },
  ];
  original.explanation = '秘密の解説';
  original.privateMemo = '秘密のメモ';
  original.sourceUrl = 'https://example.com/secret-answer';
  store.problems = [{ ...original, id: 'a' }, { ...original, id: 'b' }];
  return store;
}
function RoutesForTest() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate('/problems/b')}>次の問題へ</button><Routes><Route path="/problems/:id" element={<DetailPage />} /></Routes></>;
}
async function mount(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  await act(async () => root.render(<AppProvider><MemoryRouter initialEntries={['/problems/a']}><RoutesForTest /></MemoryRouter></AppProvider>));
}
async function click(label: string) {
  const target = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === label || button.getAttribute('aria-label') === label)!;
  await act(async () => target.click());
}

it('shows the question image beside the hand while keeping explanatory data out of the DOM until revealed', async () => {
  await mount(fixture());
  const before = localStorage.getItem(STORAGE_KEY);
  expect(host.querySelectorAll('.problem-attachments img')).toHaveLength(1);
  expect(host.querySelector('.hand-stage')!.closest('section')!.querySelector('.problem-attachments')).not.toBeNull();
  expect(host.textContent).not.toContain('秘密の解説');
  expect(host.textContent).not.toContain('秘密のメモ');
  expect(host.querySelector('[href="https://example.com/secret-answer"]')).toBeNull();
  expect(host.querySelector('.hand-stage .is-correct')).toBeNull();
  await click('問題画像 1 を拡大');
  expect(document.querySelector('[role="dialog"] img')!.getAttribute('src')).toBe(fixture().problems[0]!.attachments[0]!.dataUrl);
  await click('閉じる');
  await click('正解・解説を表示');
  expect(host.querySelectorAll('.problem-attachments img')).toHaveLength(3);
  expect(host.textContent).toContain('秘密の解説');
  await click('解説画像 1 を拡大');
  await click('次の問題へ');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelectorAll('.problem-attachments img')).toHaveLength(1);
  expect(host.textContent).not.toContain('秘密の解説');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});

it('retains existing answerless visibility for both explicit explanation and legacy images', async () => {
  const store = fixture();
  store.problems[0]!.answerEnabled = false;
  store.problems[0]!.acceptedDiscards = [];
  await mount(store);
  expect(host.querySelectorAll('.problem-attachments img')).toHaveLength(3);
  expect(host.textContent).toContain('秘密の解説');
  expect(host.querySelector('.detail-answer-toggle')).toBeNull();
});

it('does not claim explanation is empty when it contains only an image', async () => {
  const store = fixture();
  store.problems[0]!.explanation = '';
  store.problems[0]!.privateMemo = '';
  await mount(store);
  await click('正解・解説を表示');
  expect(host.textContent).not.toContain('解説・メモはまだありません。');
  expect(host.querySelectorAll('.problem-attachments img')).toHaveLength(3);
});
