import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { emptyContext, emptyStore, STORAGE_KEY, type Problem, type Store } from '@/domain/types';
import { TestPage } from './TestPage';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture(count = 12) {
  const store = emptyStore();
  store.tags = [{ id: 'small', name: '少数の対象' }, { id: 'none', name: '対象なし' }];
  store.problems = Array.from({ length: count }, (_, index): Problem => ({
    id: `p-${index}`, title: `正解あり ${index + 1}`, concealed: ['1m', '2m'], drawn: null,
    melds: [], doraIndicators: [], answerEnabled: true, acceptedDiscards: ['1m'], explanation: '',
    privateMemo: '', tagIds: index < 2 ? ['small'] : [], context: emptyContext(), attachments: [],
    sourceUrl: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }));
  store.problems.push({ ...store.problems[0]!, id: 'no-answer', title: '正解なしの学習メモ', answerEnabled: false, acceptedDiscards: [] });
  return store;
}
async function mount(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  await act(async () => root.render(<AppProvider><MemoryRouter initialEntries={['/test']}>
    <Routes><Route path="/test" element={<TestPage />} /></Routes>
  </MemoryRouter></AppProvider>));
}
function button(text: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find((item) => item.textContent?.trim() === text || item.getAttribute('aria-label') === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
function countInput() { return host.querySelector<HTMLInputElement>('.test-count input')!; }
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function key(key: string) {
  await act(async () => countInput().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
}
async function enter(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(countInput(), value);
    countInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('provides numeric, triangle and keyboard count controls with one-question steps up to all eligible problems', async () => {
  await mount(fixture());
  expect(host.textContent).not.toContain('正解ありのみ');
  expect(host.querySelector('.count-grid')).toBeNull();
  expect(host.querySelector('.count-pill')?.textContent).toBe('対象 12 問');
  expect(countInput().value).toBe('5');
  expect(countInput().min).toBe('1');
  expect(countInput().max).toBe('12');
  await click(button('問題数を増やす'));
  expect(countInput().value).toBe('6');
  await click(button('問題数を減らす'));
  expect(countInput().value).toBe('5');
  await key('End');
  expect(countInput().value).toBe('12');
  expect(button('問題数を増やす').disabled).toBe(true);
  await key('ArrowDown');
  expect(countInput().value).toBe('11');
  await key('Home');
  expect(countInput().value).toBe('1');
  expect(button('問題数を減らす').disabled).toBe(true);
  await key('ArrowUp');
  expect(countInput().value).toBe('2');
  await enter('9');
  expect(countInput().value).toBe('9');
  await enter('99');
  expect(countInput().value).toBe('12');
  await click(button('12 問でテスト開始'));
  expect(host.querySelector('h1')?.textContent).toBe('テスト 1 / 12');
  expect(host.textContent).not.toContain('正解なしの学習メモ');
});

it('follows a smaller candidate pool and consistently disables a zero-candidate setup, then recovers', async () => {
  await mount(fixture());
  const tagFilter = [...host.querySelectorAll<HTMLButtonElement>('.filter-chip')]
    .find((item) => item.querySelector('strong')?.textContent === 'タグ')!;
  await click(tagFilter);
  await click(button('少数の対象'));
  expect(countInput().value).toBe('2');
  expect(countInput().max).toBe('2');
  expect(button('問題数を増やす').disabled).toBe(true);
  await click(button('対象なし'));
  await click(button('少数の対象'));
  expect(countInput().value).toBe('0');
  expect(countInput().min).toBe('0');
  expect(countInput().max).toBe('0');
  expect(countInput().disabled).toBe(true);
  expect(button('問題数を増やす').disabled).toBe(true);
  expect(button('問題数を減らす').disabled).toBe(true);
  expect(button('条件に合う問題がありません').disabled).toBe(true);
  await click(button('少数の対象'));
  expect(countInput().value).toBe('1');
  expect(countInput().disabled).toBe(false);
  expect(button('1 問でテスト開始').disabled).toBe(false);
});

it('does not offer an answerless fallback when entering the test route directly', async () => {
  const store = fixture(1);
  store.study = [{ problemId: 'p-0', contentRevision: 0, confirmationCount: 0, lastConfirmedAt: null,
    understanding: 'unrated', lastReviewedAt: null, inTest: false }];
  await mount(store);
  expect(host.querySelector('.count-pill')?.textContent).toBe('対象 0 問');
  expect(countInput().value).toBe('0');
  expect(button('条件に合う問題がありません').disabled).toBe(true);
  expect(host.textContent).toContain('条件に合う正解ありの問題がありません');
});

it('shows question images before answering, reveals explicit and legacy explanation images only after answering, and resets for a new session', async () => {
  const store = fixture(1);
  store.problems[0]!.attachments = [
    { id: 'question', role: 'question', dataUrl: 'data:image/png;base64,AQ==', width: 1, height: 1 },
    { id: 'explanation', role: 'explanation', dataUrl: 'data:image/png;base64,Ag==', width: 1, height: 1 },
    { id: 'legacy', dataUrl: 'data:image/png;base64,Aw==', width: 1, height: 1 },
  ];
  await mount(store);
  await click(button('1 問でテスト開始'));
  expect(host.querySelectorAll('.problem-attachments img')).toHaveLength(1);
  expect(host.querySelector('.problem-attachments img')?.getAttribute('alt')).toBe('問題画像 1');
  await click(button('問題画像 1 を拡大'));
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click(host.querySelector<HTMLButtonElement>('.hand-stage button[aria-label="一萬"]')!);
  await click(button('回答する'));
  expect(host.querySelectorAll('.problem-attachments img')).toHaveLength(3);
  expect(host.querySelectorAll('section[aria-label="解説画像"] img')).toHaveLength(2);
  expect(host.textContent).not.toContain('解説はまだありません');
  await click(button('結果を見る'));
  await click(button('もう一度'));
  await click(button('1 問でテスト開始'));
  expect(host.querySelectorAll('.problem-attachments img')).toHaveLength(1);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
