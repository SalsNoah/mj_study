import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { createSampleProblems } from '@/data/samples';
import { emptyStore, LIMITS, STORAGE_KEY, type Problem, type Store } from '@/domain/types';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { LibraryPage } from './LibraryPage';

let root: Root;
let host: HTMLDivElement;

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function fixture(problems: Problem[]): Store {
  return {
    ...emptyStore(),
    tags: [{ id: 'sample-tag', name: 'サンプル' }],
    problems: problems.map((problem) => ({ ...problem, tagIds: ['sample-tag'] })),
  };
}

async function mount(data?: Store) {
  if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  await act(async () => root.render(
    <AppProvider>
      <MemoryRouter initialEntries={['/library']}>
        <Link to="/library">学習帳へ</Link>
        <Link to="/settings">設定へ</Link>
        <Routes>
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  ));
}

function button(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function click(element: HTMLElement) { await act(async () => element.click()); }
function stored(): Store { return JSON.parse(localStorage.getItem(STORAGE_KEY)!); }
function candidates() { return [...host.querySelectorAll<HTMLInputElement>('.sample-candidates input')]; }
async function fill(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

it('adds ten samples from the initially closed library panel without navigating or revealing answers', async () => {
  await mount();
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(host.querySelector('#library-sample-panel')).toBeNull();
  expect(button('サンプル管理').getAttribute('aria-expanded')).toBe('false');

  await click(button('サンプル管理'));
  expect(button('サンプルを閉じる').getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelector('#library-sample-panel > details')).toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  await click(button('サンプル10題を追加'));

  expect(host.querySelector('h1')!.textContent).toBe('学習帳');
  expect(stored().problems).toHaveLength(10);
  expect(stored().problems.filter((problem) => problem.answerEnabled)).toHaveLength(8);
  expect(stored().problems.filter((problem) => !problem.answerEnabled)).toHaveLength(2);
  expect(host.querySelectorAll('.problem-card')).toHaveLength(10);
  expect(host.querySelectorAll('.problem-card .is-correct')).toHaveLength(0);
  expect(host.querySelector('.count-pill')!.textContent).toBe('10 問');
  expect(button('この10題は追加済み').disabled).toBe(true);

  const raw = localStorage.getItem(STORAGE_KEY);
  await click(button('サンプルを閉じる'));
  expect(host.querySelector('#library-sample-panel')).toBeNull();
  await click(button('サンプル管理'));
  await click(button('この10題は追加済み'));
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

it('does not duplicate an existing complete catalog or write a backup for opening it', async () => {
  await mount(fixture(createSampleProblems().problems));
  const raw = localStorage.getItem(STORAGE_KEY);
  await click(button('サンプル管理'));
  expect(button('この10題は追加済み').disabled).toBe(true);
  await click(button('この10題は追加済み'));
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  expect(localStorage.length).toBe(1);
});

it('fills only missing catalog items while preserving edited samples and custom problems with the sample tag', async () => {
  const data = fixture(createSampleProblems().problems.slice(0, 9));
  data.problems[0]!.privateMemo = '自分の検討を追記';
  const own = { ...createLegacySampleProblems().problems[0]!, id: 'custom', title: '自作問題', tagIds: ['sample-tag'] };
  data.problems.push(own);
  await mount(data);
  await click(button('サンプル管理'));
  expect(host.textContent).toContain('編集したサンプル 1 題はそのまま残します');
  expect(candidates()).toHaveLength(0);
  await click(button('サンプル1題を追加'));

  const result = stored();
  expect(result.problems).toHaveLength(11);
  for (const problem of data.problems) expect(result.problems.find((entry) => entry.id === problem.id)).toEqual(problem);
  expect(new Set(result.problems.flatMap((problem) => problem.sample ? [problem.sample.itemId] : []))).toHaveLength(10);
  expect(button('この10題は追加済み').disabled).toBe(true);
});

it('requires a fresh explicit legacy selection after closing and offers restoration in the library', async () => {
  const data = fixture(createLegacySampleProblems().problems);
  data.problems.push({ ...data.problems[0]!, id: 'edited-legacy', privateMemo: '残す編集' });
  await mount(data);
  await click(button('サンプル管理'));
  expect(candidates()).toHaveLength(2);
  expect(candidates().every((input) => !input.checked)).toBe(true);
  await click(candidates()[0]!);
  await click(button('サンプルを閉じる'));
  await click(button('サンプル管理'));
  expect(candidates().every((input) => !input.checked)).toBe(true);
  await click(candidates()[0]!);
  await click(button('旧1題を削除して10題を追加'));

  expect(stored().problems).toHaveLength(12);
  expect(stored().problems.some((problem) => problem.id === data.problems[0]!.id)).toBe(false);
  for (const problem of data.problems.slice(1)) expect(stored().problems.find((entry) => entry.id === problem.id)).toEqual(problem);
  await click(host.querySelector<HTMLElement>('.sample-backups > summary')!);
  await click(button('更新前の問題を復元'));
  expect(stored().problems).toHaveLength(3);
  for (const problem of data.problems) expect(stored().problems.find((entry) => entry.id === problem.id)).toEqual(problem);
  expect(button('復元済み').disabled).toBe(true);
  expect(host.querySelectorAll('.problem-card')).toHaveLength(3);
});

it('leaves the exact saved data and visible library unchanged when the original backup cannot be saved', async () => {
  const data = fixture(createLegacySampleProblems().problems);
  await mount(data);
  const raw = localStorage.getItem(STORAGE_KEY);
  const originalSetItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.startsWith(`${STORAGE_KEY}:sample-catalog-backup:`)) throw new DOMException('full', 'QuotaExceededError');
    originalSetItem.call(this, key, value);
  });
  await click(button('サンプル管理'));
  await click(candidates()[0]!);
  await click(button('旧1題を削除して10題を追加'));

  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  expect(host.querySelectorAll('.problem-card')).toHaveLength(2);
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('データは変更していません');
  expect(candidates()[0]!.checked).toBe(true);
});

it.each([false, true])('preserves text, tile and tag filters, sorting and answer visibility (%s) across panel updates and reopening', async (showAnswers) => {
  vi.useFakeTimers();
  await mount(fixture(createLegacySampleProblems().problems));
  const text = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  const tile = host.querySelector<HTMLInputElement>('input[placeholder="例: 234m567p"]')!;
  const sort = host.querySelector<HTMLSelectElement>('.inline-select select')!;
  const tagMode = host.querySelector<HTMLSelectElement>('.library-filters select')!;
  const tag = host.querySelector<HTMLButtonElement>('.library-filters .tag-chip')!;
  const answer = host.querySelector<HTMLInputElement>('.library-answer-toggle input')!;
  const colorSwap = host.querySelectorAll<HTMLInputElement>('.option-row input')[1]!;

  await fill(text, 'サンプル');
  await click(host.querySelector<HTMLElement>('.library-filters > summary')!);
  await fill(tile, '234m');
  await act(async () => vi.advanceTimersByTime(LIMITS.searchDebounceMs));
  await fill(sort, 'lastSolvedOld');
  await fill(tagMode, 'and');
  await click(tag);
  await click(colorSwap);
  const selectedColorSwap = colorSwap.checked;
  if (showAnswers) await click(answer);
  await click(button('サンプル管理'));
  await click(button('旧問題を残して10題を追加'));
  await click(button('サンプルを閉じる'));
  await click(button('サンプル管理'));

  expect(text.value).toBe('サンプル');
  expect(tile.value).toBe('234m');
  expect(host.querySelectorAll('.search-query__tiles button')).toHaveLength(3);
  expect(sort.value).toBe('lastSolvedOld');
  expect(tagMode.value).toBe('and');
  expect(tag.getAttribute('aria-pressed')).toBe('true');
  expect(colorSwap.checked).toBe(selectedColorSwap);
  expect(answer.checked).toBe(showAnswers);
  expect(host.querySelector<HTMLDetailsElement>('.library-filters')!.open).toBe(true);
  expect(stored().problems).toHaveLength(12);
});

it('uses the same backups in settings and reflects a settings restoration when returning to the library', async () => {
  await mount();
  await click(button('サンプル管理'));
  await click(button('サンプル10題を追加'));
  await click(host.querySelector<HTMLAnchorElement>('a[href="/settings"]')!);
  await click(button('データ管理'));
  const section = host.querySelector<HTMLDetailsElement>('details.sample-catalog')!;
  expect(section.open).toBe(false);
  await click(section.querySelector<HTMLElement>('summary')!);
  expect(button('この10題は追加済み').disabled).toBe(true);
  await click(host.querySelector<HTMLElement>('.sample-backups > summary')!);
  await click(button('更新前の問題を復元'));
  expect(stored().problems).toHaveLength(0);
  await click(host.querySelector<HTMLAnchorElement>('a[href="/library"]')!);
  expect(host.querySelector('.count-pill')!.textContent).toBe('0 問');
  await click(button('サンプル管理'));
  expect(button('サンプル10題を追加').disabled).toBe(false);
  expect(button('復元済み').disabled).toBe(true);
});
