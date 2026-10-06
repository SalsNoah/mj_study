import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from '@/app/store';
import { emptyContext, emptyStore, STORAGE_KEY, type Problem } from '@/domain/types';
import { RecordsPage } from './RecordsPage';

let host: HTMLDivElement;
let root: Root;
let app: ReturnType<typeof useApp>;
function Probe() { app = useApp(); return null; }
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
  vi.unstubAllGlobals();
});
function fixture() {
  const store = emptyStore();
  store.tags = [{ id: 'shape', name: '牌効率' }, { id: 'empty', name: '守備' }];
  store.problems = ['a', 'b', 'note'].map((id): Problem => ({
    id, title: id, concealed: ['1m'], drawn: null, melds: [], doraIndicators: [], answerEnabled: id !== 'note',
    acceptedDiscards: id === 'note' ? [] : ['1m'], explanation: '', privateMemo: '', tagIds: id === 'note' ? ['empty'] : ['shape'],
    context: emptyContext(), attachments: [], sourceUrl: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  }));
  store.study = [{ problemId: 'a', contentRevision: 0, confirmationCount: 0, lastConfirmedAt: null,
    lastReviewedAt: null, understanding: 'uncertain' }, { problemId: 'note', contentRevision: 0, confirmationCount: 0,
    lastConfirmedAt: null, lastReviewedAt: null, understanding: 'understood' }];
  store.attempts = Array.from({ length: 11 }, (_, i) => ({ id: `a-${i}`, problemId: i < 10 ? 'a' : 'b', contentRevision: 0,
    sessionId: 'old', questionIndex: i, at: '2026-01-01T00:00:00Z', selectedTile: '1m', result: i < 9 ? 'correct' as const : 'incorrect' as const }));
  store.daily = { '2026-01-01': { tested: 11, confirmed: 7 } };
  store.materials = [{ id: 'm', title: '教材', url: 'https://example.com/', comment: '履歴', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }];
  store.materialStudyEvents = [{ id: 'm', materialId: 'm', at: '2026-01-01T00:00:00Z', title: '教材', url: 'https://example.com/', comment: '履歴' }];
  return store;
}
async function mount(store = fixture()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  await act(async () => root.render(<AppProvider><Probe /><RecordsPage /></AppProvider>));
  expect(app.loadError).toBeNull();
}
function summary() { return host.querySelector<HTMLDetailsElement>('.records-tag-summary')!; }
function rows() { return [...summary().querySelectorAll('li')]; }

it('shows weighted answer evidence and current understanding separately, with unknown rather than zero accuracy', async () => {
  const store = fixture();
  await mount(store);
  const saved = localStorage.getItem(STORAGE_KEY);
  expect(summary().open).toBe(false);
  expect(summary().querySelector('summary')!.textContent).toBe('タグ別の学習状況');
  await act(async () => summary().querySelector<HTMLElement>('summary')!.click());
  expect(summary().open).toBe(true);
  expect(summary().textContent).toContain('現在のタグ・問題内容で集計');
  expect(summary().textContent).toContain('複数タグの問題は各タグに重複して数えます');
  expect(rows()[0]!.textContent).toContain('正答率 82%（正解 9 / 回答 11回）');
  expect(rows()[0]!.textContent).toContain('理解できた 0問・まだ不安 1問・未評価 1問');
  expect(rows()[1]!.textContent).toContain('正答率 —（回答なし）');
  expect(rows()[1]!.textContent).not.toContain('0%');
  expect(rows()[1]!.textContent).toContain('理解できた 1問・まだ不安 0問・未評価 0問');
  await act(async () => host.querySelector<HTMLButtonElement>('#records-view-tab-monthly')!.click());
  expect(summary().open).toBe(true);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
  expect(app.store.daily).toEqual(store.daily);
  expect(app.store.materialStudyEvents).toEqual(store.materialStudyEvents);
});

it('follows current rename, membership and removal without altering history or badges', async () => {
  await mount();
  const attempts = structuredClone(app.store.attempts);
  const daily = structuredClone(app.store.daily);
  const titles = [...host.querySelectorAll('.records-title')].map((node) => node.textContent);
  await act(async () => { expect(app.renameTag('shape', '形の学習').ok).toBe(true); });
  expect(rows()[0]!.querySelector('h3')!.textContent).toBe('形の学習2問');
  await act(async () => { expect(app.saveProblem({ ...app.store.problems[0]!, tagIds: ['shape', 'empty'] }, false).ok).toBe(true); });
  expect(rows()[1]!.textContent).toContain('正答率 90%（正解 9 / 回答 10回）');
  await act(async () => { expect(app.setInTest('a', false).ok).toBe(true); });
  expect(rows()[0]!.textContent).toContain('回答 11回');
  await act(async () => { expect(app.deleteTag('shape').ok).toBe(true); });
  expect(summary().textContent).not.toContain('形の学習');
  expect(rows()[1]!.querySelector('h3')!.textContent).toBe('タグなし1問');
  expect(rows()[1]!.textContent).toContain('正答率 0%（正解 0 / 回答 1回）');
  expect(app.store.attempts).toEqual(attempts);
  expect(app.store.daily).toEqual(daily);
  expect([...host.querySelectorAll('.records-title')].map((node) => node.textContent)).toEqual(titles);
});

it('displays a small empty state for an empty or imported history-only library', async () => {
  const store = emptyStore();
  store.attempts = fixture().attempts;
  await mount(store);
  expect(summary().textContent).toContain('集計する問題・タグがありません');
  expect(rows()).toHaveLength(0);
});
