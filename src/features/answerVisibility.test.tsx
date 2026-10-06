import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { LibraryPage } from '@/features/library/LibraryPage';
import { DetailPage } from '@/features/detail/DetailPage';
import { TestPage } from '@/features/test/TestPage';
import { createLegacySampleProblems as createSampleProblems } from '@/data/legacySamples';
import { filterTestCandidates, selectTestProblems } from '@/domain/quiz';
import { emptyStore, STORAGE_KEY, type Store } from '@/domain/types';

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture() {
  const store = emptyStore();
  store.problems = createSampleProblems().problems;
  store.problems[0]!.id = 'answer-a';
  store.problems[0]!.explanation = '答えが分かる解説';
  store.problems[0]!.privateMemo = '答えが分かるメモ';
  store.problems[0]!.sourceUrl = 'https://example.com/answer';
  store.problems[0]!.attachments = [{ id: 'image-a', dataUrl: 'data:image/png;base64,AA==', width: 1, height: 1 }];
  store.problems[1]!.id = 'memo';
  return store;
}
function save(store: Store) { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
async function mount(page: ReactElement) {
  await act(async () => root.render(<AppProvider><MemoryRouter>{page}</MemoryRouter></AppProvider>));
}
async function click(element: HTMLElement) { await act(async () => element.click()); }
function button(label: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
function checkbox(label: string) {
  const item = [...host.querySelectorAll('label')].find((node) => node.textContent?.trim() === label);
  if (!item) throw new Error(`Missing checkbox: ${label}`);
  return item.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
}
function DetailRoutes() {
  const navigate = useNavigate();
  return <>
    <button onClick={() => navigate('/problems/answer-a')}>問題Aへ</button>
    <button onClick={() => navigate('/problems/answer-b')}>問題Bへ</button>
    <Routes><Route path="/problems/:id" element={<DetailPage />} /></Routes>
  </>;
}
async function mountDetail(id = 'answer-a') {
  await act(async () => root.render(
    <AppProvider><MemoryRouter initialEntries={[`/problems/${id}`]}><DetailRoutes /></MemoryRouter></AppProvider>,
  ));
}

it('hides library answer marks by default and toggles only answer-enabled cards without saving', async () => {
  const data = fixture();
  save(data);
  const before = localStorage.getItem(STORAGE_KEY);
  await mount(<LibraryPage />);
  expect(checkbox('正解を表示').checked).toBe(false);
  expect(host.querySelectorAll('.problem-card .is-correct')).toHaveLength(0);
  await click(checkbox('正解を表示'));
  expect(host.querySelectorAll('.problem-card .is-correct')).toHaveLength(1);
  const cards = [...host.querySelectorAll('.problem-card')];
  expect(cards.find((card) => card.getAttribute('href')?.endsWith('/memo'))!.querySelector('.is-correct')).toBeNull();
  await click(checkbox('正解を表示'));
  expect(host.querySelectorAll('.problem-card .is-correct')).toHaveLength(0);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});

it('omits detail answer marks and all explanatory material until explicitly shown', async () => {
  const data = fixture();
  save(data);
  const before = localStorage.getItem(STORAGE_KEY);
  await mountDetail();
  expect(host.querySelector('.hand-stage .is-correct')).toBeNull();
  expect(host.textContent).not.toContain('答えが分かる解説');
  expect(host.textContent).not.toContain('答えが分かるメモ');
  expect(host.querySelector('a[href="https://example.com/answer"]')).toBeNull();
  expect(host.querySelector('.attach-grid')).toBeNull();
  await click(button('正解・解説を表示'));
  expect(host.querySelector('.hand-stage .is-correct')).not.toBeNull();
  expect(host.textContent).toContain('答えが分かる解説');
  expect(host.textContent).toContain('答えが分かるメモ');
  expect(host.querySelector('a[href="https://example.com/answer"]')).not.toBeNull();
  expect(host.querySelector('.attach-grid img')).not.toBeNull();
  await click(button('受入れ'));
  await click(button('解説・メモ'));
  expect(button('正解・解説を隠す').getAttribute('aria-pressed')).toBe('true');
  await click(button('正解・解説を隠す'));
  expect(host.querySelector('.hand-stage .is-correct')).toBeNull();
  expect(host.textContent).not.toContain('答えが分かる解説');
  expect(host.querySelector('.attach-grid')).toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});

it('resets answer visibility for a different problem and when returning to a revealed problem', async () => {
  const data = fixture();
  data.problems.push({ ...data.problems[0]!, id: 'answer-b', title: '別の正解あり問題', explanation: '別問題の秘密の解説' });
  save(data);
  await mountDetail();
  await click(button('正解・解説を表示'));
  await click(button('問題Bへ'));
  expect(button('正解・解説を表示').getAttribute('aria-pressed')).toBe('false');
  expect(host.textContent).not.toContain('別問題の秘密の解説');
  expect(host.querySelector('.hand-stage .is-correct')).toBeNull();
  await click(button('正解・解説を表示'));
  await click(button('問題Aへ'));
  expect(button('正解・解説を表示').getAttribute('aria-pressed')).toBe('false');
  expect(host.textContent).not.toContain('答えが分かる解説');
});

it('keeps answerless problem notes visible and does not add an answer toggle', async () => {
  const data = fixture();
  save(data);
  await mountDetail('memo');
  expect(host.textContent).toContain(data.problems[1]!.explanation);
  expect(host.querySelector('.detail-answer-toggle')).toBeNull();
});

it('always requires an answer and combines exclusions with existing filters', () => {
  const data = fixture();
  data.problems[0]!.tagIds = ['selected'];
  data.problems.push({ ...data.problems[0]!, id: 'excluded', tagIds: ['selected'] });
  data.problems.push({ ...data.problems[0]!, id: 'other-tag', tagIds: ['other'] });
  data.study = [{ problemId: 'excluded', contentRevision: 0, confirmationCount: 0, lastConfirmedAt: null,
    understanding: 'unrated', lastReviewedAt: null, inTest: false }];
  const all = filterTestCandidates(data.problems, data.study, [], { filters: ['random'], tagIds: [] });
  expect(all.map((problem) => problem.id)).toEqual(['answer-a', 'other-tag']);
  expect(filterTestCandidates(data.problems, data.study, [], { filters: ['random'], tagIds: [], answerOnly: false })).toEqual(all);
  const options = { filters: ['tags', 'fewAnswers'] as const, tagIds: ['selected'], answerOnly: true };
  const only = filterTestCandidates(data.problems, data.study, [], { ...options, filters: [...options.filters] });
  expect(only.map((problem) => problem.id)).toEqual(['answer-a']);
  const picked = selectTestProblems(data.problems, data.study, [], { ...options, filters: [...options.filters], count: 10 }, () => 0);
  expect(picked.map((problem) => problem.id)).toEqual(only.map((problem) => problem.id));
  expect(filterTestCandidates(data.problems, data.study, [], { filters: ['lowAccuracy'], tagIds: [], answerOnly: true })).toHaveLength(0);
});

it('uses the same answer-only count and actual queue while preserving answering behavior', async () => {
  save(fixture());
  await mount(<TestPage />);
  expect(host.textContent).not.toContain('正解ありのみ');
  expect(host.querySelector('.count-pill')!.textContent).toBe('対象 1 問');
  await click(button('1 問でテスト開始'));
  expect(host.querySelector('h1')!.textContent).toBe('テスト 1 / 1');
  expect(host.textContent).not.toContain('答えが分かる解説');
  expect(host.querySelector('.hand-stage .is-correct')).toBeNull();
  expect(host.querySelector('.hand-stage [aria-pressed="true"]')).toBeNull();
  await click(host.querySelector<HTMLButtonElement>('.hand-stage button[aria-label="東"]')!);
  expect(host.querySelector('.hand-stage button[aria-label="東"]')!.getAttribute('aria-pressed')).toBe('true');
  await click(button('回答する'));
  expect(host.querySelector('.verdict')!.textContent).toBe('正解');
  expect(host.textContent).toContain('答えが分かる解説');
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as Store;
  expect(saved.attempts).toHaveLength(1);
  expect(saved.attempts[0]!.problemId).toBe('answer-a');
  expect(saved.attempts[0]!.result).toBe('correct');
});

it('does not silently fall back to answerless problems for zero eligible answers', async () => {
  const data = fixture();
  data.problems = [data.problems[1]!];
  save(data);
  await mount(<TestPage />);
  expect(host.querySelector('.count-pill')!.textContent).toBe('対象 0 問');
  expect(button('条件に合う問題がありません').disabled).toBe(true);
  expect(host.textContent).toContain('条件に合う正解ありの問題がありません');
  expect(host.querySelector<HTMLInputElement>('.test-count input')!.value).toBe('0');
  expect(host.textContent).not.toContain('正解ありのみ');
  expect(host.querySelector('.test-title')).toBeNull();
});
