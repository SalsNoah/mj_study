import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from '@/app/store';
import { LocalStorageRepository } from '@/storage/repository';
import { emptyContext, emptyStore, STORAGE_KEY, type Problem, type Store } from '@/domain/types';
import { TestPage } from './TestPage';

let host: HTMLDivElement;
let root: Root;
let app: ReturnType<typeof useApp>;
function Probe() { app = useApp(); return null; }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(Math, 'random').mockReturnValue(0.999);
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
function fixture(count = 1): Store {
  const store = emptyStore();
  store.problems = Array.from({ length: count }, (_, index): Problem => ({
    id: `p-${index}`, title: `問題 ${index + 1}`, concealed: ['1m', '2m'], drawn: null,
    melds: [], doraIndicators: [], answerEnabled: true, acceptedDiscards: ['1m'], explanation: '',
    privateMemo: '', tagIds: [], context: emptyContext(), attachments: [], sourceUrl: '',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  }));
  store.study = store.problems.map((p) => ({ problemId: p.id, contentRevision: 0, confirmationCount: 0,
    lastConfirmedAt: null, lastReviewedAt: null, understanding: 'unrated', lastSolvedAt: null, lastCorrectAt: null }));
  return store;
}
async function mount(store = fixture()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  await act(async () => root.render(<AppProvider><MemoryRouter><Probe /><TestPage /></MemoryRouter></AppProvider>));
}
function button(text: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
async function click(node: HTMLElement) { await act(async () => node.click()); }
async function start(count = 1) { await click(button(`${count} 問でテスト開始`)); }
async function answer(correct = false) {
  await click(host.querySelector<HTMLButtonElement>(`.hand-stage button[aria-label="${correct ? '一萬' : '二萬'}"]`)!);
  await click(button('回答する'));
}
function retest(count: number) { return button(`今回の誤答・不安 ${count}問を再テスト`); }

it('retests the incorrect/final-uncertain union once per problem and resets attempts and ratings in the fresh session', async () => {
  await mount(fixture(4));
  await start(4);
  await answer();
  await click(button('理解できた'));
  await click(button('次の問題へ'));
  await answer(true);
  await click(button('まだ不安'));
  await click(button('次の問題へ'));
  await answer();
  await click(button('まだ不安'));
  await click(button('次の問題へ'));
  await answer(true);
  await click(button('理解できた'));
  await click(button('結果を見る'));
  expect(host.querySelectorAll('.result-list li')).toHaveLength(4);
  expect(host.querySelectorAll('.result-list .hint')).toHaveLength(2);
  expect(retest(3).disabled).toBe(false);
  const firstSession = app.store.attempts[0]!.sessionId;
  await click(retest(3));
  expect(host.querySelector('h1')!.textContent).toBe('テスト 1 / 3');
  expect(button('回答する').disabled).toBe(true);
  for (let i = 0; i < 3; i++) {
    expect(host.querySelector('.test-title')!.textContent).toBe(`問題 ${i + 1}`);
    await answer(true);
    expect(button('まだ不安').getAttribute('aria-pressed')).toBe('false');
    await click(button(i === 2 ? '結果を見る' : '次の問題へ'));
  }
  expect(retest(0).disabled).toBe(true);
  expect(host.querySelectorAll('.result-list li')).toHaveLength(3);
  expect(host.querySelector('.result-score')!.textContent).toBe('3 / 3 問正解');
  expect(app.store.attempts).toHaveLength(7);
  const rerun = app.store.attempts.slice(4);
  expect(new Set(rerun.map((a) => a.sessionId)).size).toBe(1);
  expect(rerun[0]!.sessionId).not.toBe(firstSession);
  expect(rerun.map((a) => a.questionIndex)).toEqual([0, 1, 2]);
  expect(new Set(app.store.attempts.map((a) => a.id)).size).toBe(7);
});

it('uses only the final successful rating after repeated changes, with no duplicate retest items', async () => {
  await mount(fixture(2));
  await start(2);
  await answer(true);
  for (const label of ['まだ不安', '理解できた', 'まだ不安', '理解できた']) await click(button(label));
  expect(button('理解できた').getAttribute('aria-pressed')).toBe('true');
  await click(button('次の問題へ'));
  await answer(true);
  for (const label of ['まだ不安', '理解できた', 'まだ不安', 'まだ不安']) await click(button(label));
  await click(button('結果を見る'));
  expect(retest(1).disabled).toBe(false);
  await click(retest(1));
  expect(host.querySelector('.test-title')!.textContent).toBe('問題 2');
});

it.each(['unrated', 'understood', 'uncertain'] as const)('preserves the last saved %s rating and shows failure when saving the next rating fails', async (previous) => {
  await mount();
  await start();
  await answer(true);
  if (previous !== 'unrated') await click(button(previous === 'understood' ? '理解できた' : 'まだ不安'));
  const before = localStorage.getItem(STORAGE_KEY);
  vi.spyOn(LocalStorageRepository.prototype, 'updateUnderstanding').mockReturnValueOnce({ ok: false, code: 'quota', reason: '保存容量不足' });
  await click(button(previous === 'uncertain' ? '理解できた' : 'まだ不安'));
  expect(host.querySelector('[role="alert"]')!.textContent).toBe('理解度を保存できませんでした。保存容量不足');
  expect(button('まだ不安').getAttribute('aria-pressed')).toBe(String(previous === 'uncertain'));
  expect(button('理解できた').getAttribute('aria-pressed')).toBe(String(previous === 'understood'));
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  await click(button('結果を見る'));
  expect(retest(previous === 'uncertain' ? 1 : 0).disabled).toBe(previous !== 'uncertain');
});

it('allows retry after an answer save failure without recording an uncompleted or duplicate answer', async () => {
  await mount();
  await start();
  vi.spyOn(LocalStorageRepository.prototype, 'recordAttempt').mockReturnValueOnce({ ok: false, code: 'access', reason: '保存失敗' });
  await answer();
  expect(host.textContent).toContain('保存失敗');
  expect(app.store.attempts).toHaveLength(0);
  await click(button('回答する'));
  expect(app.store.attempts).toHaveLength(1);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await click(button('結果を見る'));
  expect(retest(1).disabled).toBe(false);
});

it('never includes unanswered questions after early finish, including early finish of a retest', async () => {
  await mount(fixture(3));
  await start(3);
  await answer();
  await click(button('次の問題へ'));
  await click(button('終了'));
  expect(host.querySelectorAll('.result-list li')).toHaveLength(1);
  await click(retest(1));
  expect(host.querySelector('h1')!.textContent).toBe('テスト 1 / 1');
  await click(button('終了'));
  expect(retest(0).disabled).toBe(true);
  expect(host.querySelectorAll('.result-list li')).toHaveLength(0);
  expect(app.store.attempts).toHaveLength(1);
});

it('disables a zero-answer result and excludes other sessions and later global understanding changes', async () => {
  const store = fixture();
  store.study[0]!.understanding = 'uncertain';
  store.attempts = [{ id: 'old', problemId: 'p-0', contentRevision: 0, sessionId: 'old', questionIndex: 0,
    at: '2026-01-01T00:00:00Z', selectedTile: '2m', result: 'incorrect' }];
  await mount(store);
  await start();
  await click(button('終了'));
  expect(retest(0).disabled).toBe(true);
  await click(button('もう一度'));
  await start();
  await answer(true);
  await click(button('結果を見る'));
  expect(retest(0).disabled).toBe(true);
  await click(button('もう一度'));
  await start();
  await answer(true);
  await click(button('まだ不安'));
  await click(button('結果を見る'));
  await act(async () => { expect(app.updateUnderstanding('p-0', 'understood').ok).toBe(true); });
  expect(retest(1).disabled).toBe(false);
  await click(retest(1));
  await answer(true);
  await click(button('結果を見る'));
  await act(async () => { expect(app.updateUnderstanding('p-0', 'uncertain').ok).toBe(true); });
  expect(retest(0).disabled).toBe(true);
});

it('updates the eligible count for removed, opted-out, answerless and revised questions and restarts with current content', async () => {
  await mount(fixture(5));
  await start(5);
  for (let i = 0; i < 5; i++) { await answer(); await click(button(i === 4 ? '結果を見る' : '次の問題へ')); }
  expect(retest(5).disabled).toBe(false);
  await act(async () => { expect(app.deleteProblem('p-1').ok).toBe(true); });
  await act(async () => { expect(app.setInTest('p-2', false).ok).toBe(true); });
  await act(async () => { expect(app.saveProblem({ ...app.store.problems.find((p) => p.id === 'p-3')!, answerEnabled: false, acceptedDiscards: [] }, false).ok).toBe(true); });
  await act(async () => { expect(app.saveProblem({ ...app.store.problems.find((p) => p.id === 'p-4')!, explanation: '編集後の内容' }, false).ok).toBe(true); });
  await act(async () => { expect(app.saveProblem({ ...app.store.problems[0]!, title: '現在の問題名' }, false).ok).toBe(true); });
  expect(retest(1).disabled).toBe(false);
  expect(host.querySelector('[role="status"]')!.textContent).toContain('4問を除外');
  await click(retest(1));
  expect(host.querySelector('.test-title')!.textContent).toBe('現在の問題名');
  expect(host.querySelector('h1')!.textContent).toBe('テスト 1 / 1');
});

it('disables retest when all answered candidates become ineligible', async () => {
  await mount();
  await start();
  await answer();
  await click(button('結果を見る'));
  await act(async () => { expect(app.setInTest('p-0', false).ok).toBe(true); });
  expect(retest(0).disabled).toBe(true);
  expect(host.textContent).toContain('1問を除外');
});

it.each(['最近答えていない', '回答数が少ない', '正答率が低い'])('does not reapply the %s filter changed by this session’s answer', async (label) => {
  const store = fixture();
  const oldCount = label === '正答率が低い' ? 3 : 2;
  store.attempts = Array.from({ length: oldCount }, (_, i) => ({ id: `old-${i}`, problemId: 'p-0', contentRevision: 0,
    sessionId: 'old', questionIndex: i, at: '2026-01-01T00:00:00Z', selectedTile: '1m', result: i === 0 ? 'incorrect' : 'correct' }));
  await mount(store);
  await click([...host.querySelectorAll<HTMLButtonElement>('.filter-chip')].find((node) => node.querySelector('strong')?.textContent === label)!);
  await start();
  await answer(true);
  await click(button('まだ不安'));
  await click(button('結果を見る'));
  await click(retest(1));
  expect(host.querySelector('h1')!.textContent).toBe('テスト 1 / 1');
  await answer(true);
  await click(button('結果を見る'));
  expect(retest(0).disabled).toBe(true);
});

it('keeps the question revision captured at session start when current content changes before answering', async () => {
  await mount();
  await start();
  await act(async () => { expect(app.saveProblem({ ...app.store.problems[0]!, explanation: '改訂した解説' }, false).ok).toBe(true); });
  await answer();
  await click(button('結果を見る'));
  expect(app.store.attempts[0]!.contentRevision).toBe(0);
  expect(app.store.study[0]!.contentRevision).toBe(1);
  expect(retest(0).disabled).toBe(true);
  expect(host.textContent).toContain('1問を除外');
});

it.each(['missing study', 'deleted problem', 'edited revision'])('does not claim a saved rating or apply it to different content after %s', async (change) => {
  const store = fixture();
  if (change === 'missing study') store.study = [];
  await mount(store);
  await start();
  await answer(true);
  if (change === 'deleted problem') {
    await act(async () => { expect(app.deleteProblem('p-0').ok).toBe(true); });
  } else if (change === 'edited revision') {
    await act(async () => { expect(app.saveProblem({ ...app.store.problems[0]!, explanation: '新しい内容' }, false).ok).toBe(true); });
  }
  const before = localStorage.getItem(STORAGE_KEY);
  const update = vi.spyOn(LocalStorageRepository.prototype, 'updateUnderstanding');
  await click(button('まだ不安'));
  expect(update).not.toHaveBeenCalled();
  expect(button('まだ不安').getAttribute('aria-pressed')).toBe('false');
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('理解度を保存できませんでした');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  await click(button('結果を見る'));
  expect(retest(0).disabled).toBe(true);
});
