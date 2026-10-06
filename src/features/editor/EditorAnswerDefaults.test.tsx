import { TestRouter as MemoryRouter } from '@/test/TestRouter';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { emptyContext, emptyStore, STORAGE_KEY, type Problem, type Store } from '@/domain/types';
import { filterTestCandidates } from '@/domain/quiz';
import { DEFAULT_SHARE_OPTIONS, extractSharePayload } from '@/domain/share';
import { LocalStorageRepository, type SaveResult } from '@/storage/repository';
import { putImportDraft } from '@/features/import/draft';
import { EditorPage } from './EditorPage';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); sessionStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function mount(id = 'new') {
  await act(async () => root.render(<AppProvider><MemoryRouter initialEntries={[`/edit/${id}`]}><Routes>
    <Route path="/edit/:id" element={<EditorPage />} />
    <Route path="/problems/:id" element={<div>saved</div>} />
  </Routes></MemoryRouter></AppProvider>));
}
function checkbox(text: string) {
  return [...host.querySelectorAll<HTMLLabelElement>('label')].find(label => label.textContent?.trim() === text)
    ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
}
const notes = () => host.querySelector<HTMLDetailsElement>('.editor-notes')!;
const readStore = (): Store => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
const save = () => host.querySelector<HTMLButtonElement>('.editor-save')!;
async function click(element: HTMLElement) { await act(async () => element.click()); }
function seed(answerEnabled: boolean, inTest: boolean): Store {
  const store = emptyStore();
  const problem: Problem = { id: 'existing', title: '保存済みの問題', concealed: ['1m', '2m'], drawn: null,
    melds: [], doraIndicators: [], answerEnabled, acceptedDiscards: answerEnabled ? ['1m'] : [],
    explanation: '保存済みの解説', privateMemo: '保存済みのメモ', tagIds: [], context: emptyContext(),
    attachments: [], sourceUrl: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  store.problems = [problem];
  store.study = [{ problemId: problem.id, contentRevision: 0, confirmationCount: 0,
    lastConfirmedAt: null, understanding: 'unrated', lastReviewedAt: null, lastSolvedAt: null, lastCorrectAt: null, inTest }];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  return store;
}
function resultStore(result: SaveResult): Store {
  if (!result.ok) throw new Error(result.reason);
  return result.store;
}

it('opens notes and enables answers and testing only for a new manual entry, without saving or selecting answers', async () => {
  await mount();
  expect(notes().open).toBe(true);
  expect(checkbox('正解を設定する')!.checked).toBe(true);
  expect(checkbox('テストに出題する')!.checked).toBe(true);
  for (const label of ['正解を設定する', 'テストに出題する']) {
    expect(checkbox(label)!.tabIndex).toBe(0);
    expect(checkbox(label)!.labels?.[0]?.textContent?.trim()).toBe(label);
  }
  expect(host.querySelectorAll('.hand-stage--pick .tile-btn')).toHaveLength(0);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  await click(host.querySelector<HTMLButtonElement>('.tile-palette button[aria-label="一萬"]')!);
  await click(notes().querySelector('summary')!);
  expect(notes().open).toBe(false);
  await click(save());
  expect(notes().open).toBe(true);
  expect(host.textContent).toContain('正解設定ONのときは正解牌を1枚以上選んでください');
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  await click(host.querySelector<HTMLButtonElement>('.hand-stage--pick button[aria-label="一萬"]')!);
  await click(save());
  expect(host.textContent).toBe('saved');
  expect(readStore().problems[0]).toMatchObject({ answerEnabled: true, acceptedDiscards: ['1m'] });
  expect(readStore().study[0]?.inTest).toBe(true);
});

it.each([true, false])('retains the child test choice %s while its parent is off and back on', async inTest => {
  await mount();
  if (!inTest) await click(checkbox('テストに出題する')!);
  await click(checkbox('正解を設定する')!);
  expect(checkbox('テストに出題する')).toBeUndefined();
  await click(checkbox('正解を設定する')!);
  expect(checkbox('テストに出題する')!.checked).toBe(inTest);
  await click(host.querySelector<HTMLButtonElement>('.tile-palette button[aria-label="一萬"]')!);
  await click(checkbox('正解を設定する')!);
  await click(save());
  expect(readStore().problems[0]).toMatchObject({ answerEnabled: false, acceptedDiscards: [] });
  expect(readStore().study[0]?.inTest).toBe(inTest);
  expect(filterTestCandidates(readStore().problems, readStore().study, [], { filters: ['random'], tagIds: [] })).toEqual([]);
});

it.each([[false, false], [false, true], [true, false], [true, true]])('preserves saved answer=%s and test=%s settings on open and save', async (answerEnabled, inTest) => {
  const before = seed(answerEnabled, inTest);
  await mount('existing');
  expect(notes().open).toBe(true);
  expect(checkbox('正解を設定する')!.checked).toBe(answerEnabled);
  if (answerEnabled) expect(checkbox('テストに出題する')!.checked).toBe(inTest);
  else expect(checkbox('テストに出題する')).toBeUndefined();
  expect(readStore()).toEqual(before);
  await click(save());
  expect(readStore().problems[0]).toMatchObject({ ...before.problems[0], updatedAt: expect.any(String) });
  expect(readStore().study).toEqual(before.study);
});

it('keeps an OCR draft answerless when saved', async () => {
  putImportDraft({ concealed: ['1m'], melds: [], doraIndicators: [], context: emptyContext() });
  await mount();
  expect(notes().open).toBe(true);
  expect(checkbox('正解を設定する')!.checked).toBe(false);
  expect(checkbox('テストに出題する')).toBeUndefined();
  await click(save());
  expect(readStore().problems[0]).toMatchObject({ answerEnabled: false, acceptedDiscards: [] });
});

it.each(['duplicate', 'share'] as const)('does not enable answers when opening an answerless %s for editing', async source => {
  const initial = seed(false, false);
  const repo = new LocalStorageRepository();
  let saved: Store;
  try {
    saved = resultStore(source === 'duplicate' ? repo.duplicateProblem(initial, 'existing')
      : repo.addFromShare(initial, extractSharePayload(initial.problems[0]!, [], DEFAULT_SHARE_OPTIONS)));
  } finally { repo.dispose(); }
  const added = saved.problems.find(problem => problem.id !== 'existing')!;
  await mount(added.id);
  expect(checkbox('正解を設定する')!.checked).toBe(false);
  expect(checkbox('テストに出題する')).toBeUndefined();
  expect(readStore()).toEqual(saved);
  await click(save());
  expect(readStore().problems.find(problem => problem.id === added.id)).toMatchObject({ answerEnabled: false, acceptedDiscards: [] });
  expect(readStore().study).toHaveLength(saved.study.length);
  expect(readStore().study).toMatchObject(saved.study);
});
