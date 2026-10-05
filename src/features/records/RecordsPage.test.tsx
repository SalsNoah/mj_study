import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { emptyStore, STORAGE_KEY } from '@/domain/types';
import { RecordsPage } from './RecordsPage';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 5, 12));
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(<AppProvider><RecordsPage /></AppProvider>));
}
function panel(value: string) {
  return host.querySelector<HTMLDivElement>(`#records-view-panel-${value}`)!;
}
async function choose(value: string) {
  await act(async () => host.querySelector<HTMLButtonElement>(`#records-view-tab-${value}`)!.click());
}

it('offers only three time periods and explains zero histories with an accessible number table', async () => {
  await mount();
  expect([...host.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual(['日別', '週別', '月別']);
  expect(host.querySelector('#records-view-panel-badges')).toBeNull();
  expect(panel('daily').querySelector('.records-empty')!.textContent).toContain('学習記録はまだありません');
  expect(panel('daily').querySelector('[role="img"]')!.getAttribute('aria-label')).toContain('テスト0回、確認0回');
  expect(panel('daily').querySelectorAll('tbody tr')).toHaveLength(14);
  expect(panel('weekly').querySelectorAll('tbody tr')).toHaveLength(12);
  expect(panel('monthly').querySelectorAll('tbody tr')).toHaveLength(12);
  expect(panel('daily').querySelector('details')!.open).toBe(false);
});

it('shows period sums and unchanged titles while preserving the stored history', async () => {
  const store = emptyStore();
  store.daily = { '2026-08-01': { tested: 50, confirmed: 0 }, '2026-09-27': { tested: 2, confirmed: 3 }, '2026-10-04': { tested: 4, confirmed: 1 }, '2026-10-05': { tested: 1, confirmed: 2 } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  const before = localStorage.getItem(STORAGE_KEY);
  await mount();
  expect(panel('daily').querySelector('tfoot')!.textContent).toBe('合計76');
  expect(panel('weekly').querySelector('tfoot')!.textContent).toBe('合計576');
  expect(host.querySelector('.records-title h2')!.textContent).toBe('受け入れ職人');
  expect(host.querySelector('.records-title__next')!.textContent).toContain('あと 37 回');
  const progress = host.querySelector('[role="progressbar"]')!;
  expect(progress.getAttribute('aria-valuemin')).toBe('60');
  expect(progress.getAttribute('aria-valuemax')).toBe('100');
  expect(progress.getAttribute('aria-valuenow')).toBe('63');
  const rows = panel('daily').querySelectorAll('tbody tr');
  expect(rows[0]!.textContent).toContain('2026/9/22');
  expect([...rows[13]!.querySelectorAll('th, td')].map((cell) => cell.textContent)).toEqual(['2026/10/5', '1', '2']);
  for (const value of ['weekly', 'monthly', 'daily', 'weekly']) await choose(value);
  expect(panel('weekly').textContent).toContain('月曜始まり・今週は今日までの合計');
  expect(panel('monthly').textContent).toContain('今月は今日までの合計');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});

it('keeps the expanded number list when switching periods by keyboard', async () => {
  await mount();
  const disclosure = panel('daily').querySelector('details')!;
  await act(async () => disclosure.querySelector('summary')!.click());
  expect(disclosure.open).toBe(true);
  const dailyTab = host.querySelector<HTMLButtonElement>('#records-view-tab-daily')!;
  dailyTab.focus();
  await act(async () => dailyTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
  expect(document.activeElement?.id).toBe('records-view-tab-monthly');
  expect(panel('monthly').hidden).toBe(false);
  expect(panel('daily').hidden).toBe(true);
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  expect(document.activeElement).toBe(dailyTab);
  expect(panel('daily').hidden).toBe(false);
  expect(panel('daily').querySelector('details')).toBe(disclosure);
  expect(disclosure.open).toBe(true);
});

it('keeps the highest existing title and omits an unreachable next goal', async () => {
  const store = emptyStore();
  store.daily = { '2026-10-05': { tested: 2500, confirmed: 500 } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  await mount();
  expect(host.querySelector('.records-title h2')!.textContent).toBe('極みの打ち手');
  expect(host.querySelector('.records-title__complete')!.textContent).toBe('すべての称号に到達しました');
  expect(host.querySelector('.records-title__next')).toBeNull();
  expect(host.querySelector('[role="progressbar"]')).toBeNull();
  expect(host.querySelector('.records-title__total')!.textContent).toContain('3,000回');
});
