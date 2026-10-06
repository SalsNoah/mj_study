import { TestRouter as MemoryRouter } from '@/test/TestRouter';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { LibraryPage } from '@/features/library/LibraryPage';
import { RecordsPage } from '@/features/records/RecordsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { EditorPage } from '@/features/editor/EditorPage';
import { DetailPage } from '@/features/detail/DetailPage';
import { TestPage } from '@/features/test/TestPage';
import { createLegacySampleProblems as createSampleProblems } from '@/data/legacySamples';
import { emptyStore, LIMITS, STORAGE_KEY } from '@/domain/types';

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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function seed() {
  const data = emptyStore();
  data.problems = createSampleProblems().problems;
  data.tags = [{ id: 'tag-test', name: '手筋' }];
  data.problems[0]!.tagIds = ['tag-test'];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

async function mount(page: ReactElement) {
  await act(async () => root.render(<AppProvider><MemoryRouter>{page}</MemoryRouter></AppProvider>));
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
}

function button(text: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('shows the library list immediately and distinguishes no matches from an empty notebook', async () => {
  seed();
  await mount(<LibraryPage />);
  const filters = host.querySelector<HTMLDetailsElement>('.library-filters')!;
  expect(filters.open).toBe(false);
  expect(host.querySelectorAll('.problem-card')).toHaveLength(2);
  const query = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  expect(query.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await input(query, '存在しない問題');
  expect(host.querySelectorAll('.problem-card')).toHaveLength(0);
  expect(host.querySelector('.empty')!.textContent).toContain('条件に合う問題がありません');
  await click(button('すべての問題を見る'));
  expect(query.value).toBe('');
  expect(host.querySelectorAll('.problem-card')).toHaveLength(2);
});

it('shows the create action only for an empty notebook', async () => {
  await mount(<LibraryPage />);
  expect(host.querySelector('.empty')!.textContent).toContain('まだ問題がありません');
  expect(host.querySelector('.empty a')!.getAttribute('href')).toBe('/');
  expect(host.querySelector('.empty button')).toBeNull();
});

it('preserves tile and tag filters through disclosure changes and offers a visible reset', async () => {
  seed();
  await mount(<LibraryPage />);
  const filters = host.querySelector<HTMLDetailsElement>('.library-filters')!;
  await click(filters.querySelector('summary')!);
  await click(host.querySelector<HTMLButtonElement>('.tile-palette button[aria-label="二萬"]')!);
  await click(button('手筋'));
  expect(host.querySelector('.filter-summary')!.textContent).toContain('牌姿 1枚・タグ 1件');
  expect(host.querySelectorAll('.problem-card')).toHaveLength(1);
  await click(filters.querySelector('summary')!);
  expect(filters.open).toBe(false);
  await click(filters.querySelector('summary')!);
  expect(host.querySelectorAll('.search-query__tiles .tile-btn')).toHaveLength(1);
  expect(button('手筋').getAttribute('aria-pressed')).toBe('true');
  await click(button('検索をクリア'));
  expect(host.querySelector('.filter-summary')).toBeNull();
  expect(host.querySelectorAll('.problem-card')).toHaveLength(2);
});

it('keeps an invalid tile query error discoverable when filters are collapsed', async () => {
  vi.useFakeTimers();
  seed();
  await mount(<LibraryPage />);
  const filters = host.querySelector<HTMLDetailsElement>('.library-filters')!;
  await click(filters.querySelector('summary')!);
  await input(host.querySelector<HTMLInputElement>('input[placeholder="例: 234m567p"]')!, 'abc!');
  await act(async () => vi.advanceTimersByTime(LIMITS.searchDebounceMs + 1));
  await click(filters.querySelector('summary')!);
  const error = host.querySelector('#library-tile-error')!;
  expect(error.getAttribute('role')).toBe('alert');
  expect(error.closest('details')).toBeNull();
  expect(host.querySelector('.filter-summary')!.textContent).toContain('牌姿の入力を確認');
  await click(button('検索をクリア'));
  expect(host.querySelector('#library-tile-error')).toBeNull();
});

it('switches daily, weekly and monthly records with keyboard controls while preserving panels', async () => {
  await mount(<RecordsPage />);
  const daily = host.querySelector<HTMLDivElement>('#records-view-panel-daily')!;
  const weekly = host.querySelector<HTMLDivElement>('#records-view-panel-weekly')!;
  const monthly = host.querySelector<HTMLDivElement>('#records-view-panel-monthly')!;
  const dailyTab = button('日別');
  const weeklyTab = button('週別');
  expect(daily.hidden).toBe(false);
  expect(weekly.hidden).toBe(true);
  expect(daily.getAttribute('aria-labelledby')).toBe(dailyTab.id);
  expect(daily.querySelectorAll('tbody tr')).toHaveLength(14);
  dailyTab.focus();
  await act(async () => dailyTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(document.activeElement).toBe(weeklyTab);
  expect(weeklyTab.getAttribute('aria-selected')).toBe('true');
  expect(weeklyTab.tabIndex).toBe(0);
  expect(dailyTab.tabIndex).toBe(-1);
  expect(daily.hidden).toBe(true);
  expect(weekly.hidden).toBe(false);
  await act(async () => weeklyTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
  expect(monthly.hidden).toBe(false);
  await act(async () => button('月別').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  expect(document.activeElement).toBe(dailyTab);
  expect(host.querySelector('#records-view-panel-daily')).toBe(daily);
  expect(daily.hidden).toBe(false);
});

it('groups settings with backup access and preserves destructive-action confirmation', async () => {
  seed();
  const before = localStorage.getItem(STORAGE_KEY);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await mount(<SettingsPage />);
  const display = host.querySelector<HTMLDivElement>('#settings-view-panel-display')!;
  const data = host.querySelector<HTMLDivElement>('#settings-view-panel-data')!;
  expect(display.hidden).toBe(false);
  expect(data.hidden).toBe(true);
  await click(button('データ管理'));
  expect(data.hidden).toBe(false);
  expect(button('JSONバックアップ').closest('[hidden]')).toBeNull();
  const danger = host.querySelector<HTMLDetailsElement>('.settings-danger')!;
  expect(danger.open).toBe(false);
  await click(danger.querySelector('summary')!);
  await click(button('全件削除'));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(confirm.mock.calls[0]![0]).toContain('すべての問題・履歴・画像・サンプル更新前バックアップを削除');
  expect(confirm.mock.calls[0]![0]).toContain('必要なJSONを保存してください');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  await click(button('表示・編集'));
  await click(button('データ管理'));
  expect(host.querySelector('#settings-view-panel-data')).toBe(data);
  expect(danger.open).toBe(true);
});

it('keeps a pending backup import through settings-tab changes and cancels without writing', async () => {
  const initial = seed();
  const before = localStorage.getItem(STORAGE_KEY);
  await mount(<SettingsPage />);
  await click(button('データ管理'));
  const picker = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([JSON.stringify(initial)], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => JSON.stringify(initial) });
  Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
  await act(async () => picker.dispatchEvent(new Event('change', { bubbles: true })));
  const preview = host.querySelector('.import-preview')!;
  expect(preview.textContent).toContain('問題 2 件');
  await click(button('表示・編集'));
  await click(button('データ管理'));
  expect(host.querySelector('.import-preview')).toBe(preview);
  await click(button('キャンセル'));
  expect(host.querySelector('.import-preview')).toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});


async function mountProblem(page: ReactElement, path: string, id: string) {
  await act(async () => root.render(
    <AppProvider><MemoryRouter initialEntries={[path.replace(':id', id)]}>
      <Routes><Route path={path} element={page} /></Routes>
    </MemoryRouter></AppProvider>,
  ));
}

async function adjustFirstRemaining() {
  await click(button('残枚数'));
  const remaining = host.querySelector<HTMLInputElement>('input[aria-label="一萬の残枚数"]')!;
  await input(remaining, '0');
  return remaining;
}

it('keeps conditions above the full palette and preserves drafts while opening optional notes', async () => {
  const data = seed();
  const before = localStorage.getItem(STORAGE_KEY);
  await mountProblem(<EditorPage />, '/edit/:id', data.problems[0]!.id);
  const handPanel = host.querySelector<HTMLElement>('.tile-input')!;
  const context = host.querySelector<HTMLElement>('.context-panel')!;
  expect(context.compareDocumentPosition(handPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(context.closest('[hidden]')).toBeNull();
  expect(host.querySelector('#editor-view-tab-context')).toBeNull();
  expect(host.querySelector('.tile-palette__suits')).toBeNull();
  expect(host.querySelectorAll('.tile-palette__row:not([hidden])')).toHaveLength(4);
  expect(host.querySelectorAll('.tile-palette button')).toHaveLength(37);
  expect(handPanel.querySelectorAll('.hand-strip .tile-btn')).toHaveLength(14);
  const remaining = await adjustFirstRemaining();
  const disclosure = host.querySelector<HTMLDetailsElement>('.editor-notes')!;
  expect(disclosure.open).toBe(true);
  const notes = disclosure.querySelector<HTMLTextAreaElement>('textarea')!;
  await input(notes, '保存前の解説を保持');
  await click(disclosure.querySelector('summary')!);
  const honba = host.querySelector<HTMLInputElement>('input[aria-label="本場"]')!;
  await input(honba, '2');
  expect(handPanel.querySelectorAll('.hand-strip .tile-btn')).toHaveLength(14);
  expect(host.querySelector('input[aria-label="一萬の残枚数"]')).toBe(remaining);
  expect(remaining.value).toBe('0');
  await click(disclosure.querySelector('summary')!);
  expect(notes.value).toBe('保存前の解説を保持');
  expect(honba.value).toBe('2');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});

it('opens optional notes for answer errors while conditions always stay directly available', async () => {
  const data = seed();
  data.problems[0]!.answerEnabled = false;
  data.problems[0]!.acceptedDiscards = [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  await mountProblem(<EditorPage />, '/edit/:id', data.problems[0]!.id);
  const disclosure = host.querySelector<HTMLDetailsElement>('.editor-notes')!;
  expect(disclosure.open).toBe(true);
  const answer = [...disclosure.querySelectorAll('label')].find(label=>label.textContent?.trim()==='正解を設定する')!.querySelector<HTMLInputElement>('input')!;
  await click(answer);
  await click(disclosure.querySelector('summary')!);
  expect(disclosure.open).toBe(false);
  await click(button('保存'));
  expect(disclosure.open).toBe(true);
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('正解');
  await click(answer);
  await input(host.querySelector<HTMLInputElement>('input[aria-label="本場"]')!, '100');
  await click(disclosure.querySelector('summary')!);
  await click(button('保存'));
  expect(host.querySelector('.context-panel')!.closest('[hidden]')).toBeNull();
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('本場は0〜99');
});

it('opens detail notes first and retains remaining adjustments and all-candidate expansion across tabs', async () => {
  const data = seed();
  const before = localStorage.getItem(STORAGE_KEY);
  await mountProblem(<DetailPage />, '/problems/:id', data.problems[0]!.id);
  expect(host.querySelector<HTMLDivElement>('#detail-view-panel-notes')!.hidden).toBe(false);
  expect(button('確認した').closest('[role="tabpanel"]')).toBeNull();
  await click(button('受入れ'));
  expect(host.querySelectorAll('.ukeire-list > li:not([hidden])')).toHaveLength(3);
  expect(host.querySelector('.ukeire-order')!.textContent).toBe('最小シャンテン内・枚数順');
  const remaining = await adjustFirstRemaining();
  const expand = host.querySelector<HTMLButtonElement>('.ukeire-expand')!;
  await click(expand);
  expect(expand.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelectorAll('.ukeire-list > li:not([hidden])').length).toBeGreaterThan(3);
  await click(button('記録'));
  await click(button('解説・メモ'));
  await click(button('受入れ'));
  expect(remaining.value).toBe('0');
  expect(host.querySelector('input[aria-label="一萬の残枚数"]')).toBe(remaining);
  expect(expand.getAttribute('aria-expanded')).toBe('true');
  await click(expand);
  expect(host.querySelectorAll('.ukeire-list > li:not([hidden])')).toHaveLength(3);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});

it('hides answer information before answering and retains answer-tab adjustments without duplicate attempts', async () => {
  const data = seed();
  data.problems = [data.problems[0]!];
  data.problems[0]!.answerEnabled = true;
  data.problems[0]!.acceptedDiscards = ['1z'];
  data.problems[0]!.explanation = '回答後だけの解説';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  await mount(<TestPage />);
  await click(button('1 問でテスト開始'));
  expect(host.querySelector('.ukeire-panel')).toBeNull();
  expect(host.querySelector('#answer-view-panel-notes')).toBeNull();
  expect(host.textContent).not.toContain('回答後だけの解説');
  await click(host.querySelector<HTMLButtonElement>('.hand-stage button[aria-label="東"]')!);
  await click(button('回答する'));
  expect(host.querySelector<HTMLDivElement>('#answer-view-panel-notes')!.hidden).toBe(false);
  expect(host.textContent).toContain('回答後だけの解説');
  await click(button('受入れ'));
  const remaining = await adjustFirstRemaining();
  await click(button('解説'));
  await click(button('受入れ'));
  expect(remaining.value).toBe('0');
  expect(button('結果を見る').closest('[role="tabpanel"]')).toBeNull();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).attempts).toHaveLength(1);
  await click(button('結果を見る'));
  expect(host.querySelector('.ukeire-panel')).toBeNull();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).attempts).toHaveLength(1);
});
