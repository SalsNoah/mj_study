import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { LibraryPage } from '@/features/library/LibraryPage';
import { RecordsPage } from '@/features/records/RecordsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { createSampleProblems } from '@/data/samples';
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

async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
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

it('switches record tabs with accessible keyboard controls while preserving both panels', async () => {
  await mount(<RecordsPage />);
  const daily = host.querySelector<HTMLDivElement>('#records-view-panel-daily')!;
  const badges = host.querySelector<HTMLDivElement>('#records-view-panel-badges')!;
  const dailyTab = button('日別');
  const badgeTab = button('称号');
  expect(daily.hidden).toBe(false);
  expect(badges.hidden).toBe(true);
  expect(daily.getAttribute('aria-labelledby')).toBe(dailyTab.id);
  expect(host.querySelectorAll('.daily-list li')).toHaveLength(14);
  dailyTab.focus();
  await act(async () => dailyTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(document.activeElement).toBe(badgeTab);
  expect(badgeTab.getAttribute('aria-selected')).toBe('true');
  expect(badgeTab.tabIndex).toBe(0);
  expect(dailyTab.tabIndex).toBe(-1);
  expect(daily.hidden).toBe(true);
  expect(badges.hidden).toBe(false);
  await act(async () => badgeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
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
  expect(confirm.mock.calls[0]![0]).toContain('すべての問題・履歴・画像を削除');
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
