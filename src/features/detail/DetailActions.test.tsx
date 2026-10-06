import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { emptyStore, STORAGE_KEY, type Store } from '@/domain/types';
import { LocalStorageRepository } from '@/storage/repository';
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture() {
  const store = emptyStore();
  const original = createLegacySampleProblems().problems[0]!;
  store.problems = [{ ...original, id: 'a', title: '複製する問題', tagIds: ['tag'],
    attachments: [
      { id: 'question', role: 'question', dataUrl: 'data:image/png;base64,AQ==', width: 1, height: 1 },
      { id: 'explanation', role: 'explanation', dataUrl: 'data:image/png;base64,Ag==', width: 1, height: 1 },
      { id: 'legacy', dataUrl: 'data:image/png;base64,Aw==', width: 1, height: 1 },
    ],
  }, { ...original, id: 'b', title: '別の問題' }];
  store.tags = [{ id: 'tag', name: '複製するタグ' }];
  store.study = [{ problemId: 'a', contentRevision: 0, confirmationCount: 3,
    lastConfirmedAt: '2026-01-01T00:00:00.000Z', lastSolvedAt: null, lastCorrectAt: null,
    understanding: 'understood', lastReviewedAt: null, inTest: false }];
  return store;
}
function DetailRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  return <>
    <output data-testid="path">{location.pathname}</output>
    <button onClick={() => navigate('/problems/a')}>問題Aへ</button>
    <button onClick={() => navigate('/problems/b')}>問題Bへ</button>
    <Routes><Route path="/problems/:id" element={<DetailPage />} /></Routes>
  </>;
}
async function mount(store = fixture()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  await act(async () => root.render(<AppProvider><MemoryRouter initialEntries={['/problems/a']}><DetailRoutes /></MemoryRouter></AppProvider>));
  host.querySelector<HTMLDetailsElement>('.detail-tools')!.open = true;
}
function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
function stored(): Store { return JSON.parse(localStorage.getItem(STORAGE_KEY)!); }
async function click(element: Element) { await act(async () => (element as HTMLElement).click()); }
async function key(value: string, shiftKey = false) {
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true })));
}

it.each(['cancel', 'escape', 'backdrop'])('leaves saved data unchanged on %s and restores focus to the opener', async (dismissal) => {
  await mount();
  const before = localStorage.getItem(STORAGE_KEY);
  const duplicate = vi.spyOn(LocalStorageRepository.prototype, 'duplicateProblem');
  const opener = button('複製');
  opener.focus();
  await click(opener);
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.textContent).toContain('「複製する問題」を複製します。');
  expect(document.activeElement).toBe(button('キャンセル'));
  expect(document.body.style.overflow).toBe('hidden');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  await click(dialog.querySelector('p')!);
  expect(document.querySelector('[role="dialog"]')).toBe(dialog);
  if (dismissal === 'cancel') await click(button('キャンセル'));
  else if (dismissal === 'escape') await key('Escape');
  else await click(document.querySelector('.duplicate-confirmation-backdrop')!);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(document.body.style.overflow).toBe('');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  expect(duplicate).not.toHaveBeenCalled();
  expect(host.querySelector('[data-testid="path"]')!.textContent).toBe('/problems/a');
});

it('traps keyboard focus and permits reopening after cancellation', async () => {
  await mount();
  await click(button('複製'));
  await key('Tab', true);
  expect(document.activeElement).toBe(button('複製する'));
  await key('Tab');
  expect(document.activeElement).toBe(button('キャンセル'));
  button('問題Bへ').focus();
  expect(document.activeElement).toBe(button('キャンセル'));
  await key('Escape');
  await click(button('複製'));
  expect(document.activeElement).toBe(button('キャンセル'));
  await click(button('キャンセル'));
  expect(stored().problems).toHaveLength(2);
});

it('creates exactly one copy only after confirmation, preserving the existing content and new-study semantics', async () => {
  await mount();
  const before = stored();
  const duplicate = vi.spyOn(LocalStorageRepository.prototype, 'duplicateProblem');
  const opener = button('複製');
  await act(async () => { opener.click(); opener.click(); });
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(duplicate).not.toHaveBeenCalled();
  const confirm = button('複製する');
  await act(async () => { confirm.click(); confirm.click(); });
  const after = stored();
  expect(duplicate).toHaveBeenCalledTimes(1);
  expect(after.problems).toHaveLength(3);
  expect(after.problems.slice(0, 2)).toEqual(before.problems);
  const copy = after.problems[2]!;
  const original = before.problems[0]!;
  expect(copy.id).not.toBe(original.id);
  expect(copy).toMatchObject({ title: original.title, concealed: original.concealed, drawn: original.drawn,
    doraIndicators: original.doraIndicators, context: original.context, tagIds: original.tagIds,
    answerEnabled: original.answerEnabled, acceptedDiscards: original.acceptedDiscards,
    explanation: original.explanation, privateMemo: original.privateMemo, sourceUrl: original.sourceUrl });
  expect(copy.attachments.map(({ id: _id, ...attachment }) => attachment))
    .toEqual(original.attachments.map(({ id: _id, ...attachment }) => attachment));
  expect(copy.attachments.every((attachment) => !original.attachments.some((item) => item.id === attachment.id))).toBe(true);
  expect(after.tags).toEqual(before.tags);
  expect(after.study.find((study) => study.problemId === original.id)).toEqual(before.study.find((study) => study.problemId === original.id));
  expect(after.study.find((study) => study.problemId === copy.id)).toMatchObject({ confirmationCount: 0, understanding: 'unrated', inTest: true });
  expect(after.attempts).toEqual(before.attempts);
  expect(after.daily).toEqual(before.daily);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('[data-testid="path"]')!.textContent).toBe(`/problems/${copy.id}`);
});

it('does not save on failure and allows an explicitly confirmed retry', async () => {
  await mount();
  const before = localStorage.getItem(STORAGE_KEY);
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
  await click(button('複製'));
  await click(button('複製する'));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(button('複製'));
  expect(host.textContent).toContain('保存');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  expect(host.querySelector('[data-testid="path"]')!.textContent).toBe('/problems/a');
  write.mockRestore();
  await click(button('複製'));
  await click(button('複製する'));
  expect(stored().problems).toHaveLength(3);
});

it('dismisses pending confirmation after navigation, including when returning to the original problem', async () => {
  await mount();
  const before = localStorage.getItem(STORAGE_KEY);
  await click(button('複製'));
  await click(button('問題Bへ'));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.body.style.overflow).toBe('');
  await click(button('問題Aへ'));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});

it('uses the visible untitled fallback in confirmation', async () => {
  const store = fixture();
  store.problems[0]!.title = '  ';
  await mount(store);
  await click(button('複製'));
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain('「無題の問題」を複製します。');
});

it('retains attached images and compact remaining tools after PNG and problem sharing retirement', async () => {
  await mount();
  const before = localStorage.getItem(STORAGE_KEY);
  expect(host.textContent).not.toContain('PNG保存');
  expect(host.textContent).not.toContain('PNGプレビュー');
  expect(host.querySelector('[download], .png-preview')).toBeNull();
  expect(host.querySelectorAll('.problem-attachments img')).toHaveLength(1);
  await click(button('正解・解説を表示'));
  expect(host.querySelectorAll('.problem-attachments img')).toHaveLength(3);
  expect(host.textContent).not.toContain('共有');
  expect(host.querySelector('.share-box, .detail-tools section')).toBeNull();
  expect(host.querySelector('.detail-tools summary')?.textContent).toBe('その他');
  expect([...host.querySelectorAll('.detail-tools button')].map((item) => item.textContent?.trim())).toEqual(['複製', '削除']);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});
