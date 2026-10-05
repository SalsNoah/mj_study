import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from '@/app/store';
import { emptyStore, STORAGE_KEY, type MaterialStudyEvent } from '@/domain/types';
import { LocalStorageRepository } from '@/storage/repository';
import { MaterialStudyHistory } from './MaterialStudyHistory';
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
  expect(panel('daily').querySelector('tfoot')!.textContent).toBe('合計760');
  expect(panel('weekly').querySelector('tfoot')!.textContent).toBe('合計5760');
  expect(host.querySelector('.records-title h2')!.textContent).toBe('受け入れ職人');
  expect(host.querySelector('.records-title__next')!.textContent).toContain('あと 37 回');
  const progress = host.querySelector('[role="progressbar"]')!;
  expect(progress.getAttribute('aria-valuemin')).toBe('60');
  expect(progress.getAttribute('aria-valuemax')).toBe('100');
  expect(progress.getAttribute('aria-valuenow')).toBe('63');
  const rows = panel('daily').querySelectorAll('tbody tr');
  expect(rows[0]!.textContent).toContain('2026/9/22');
  expect([...rows[13]!.querySelectorAll('th, td')].map((cell) => cell.textContent)).toEqual(['2026/10/5', '1', '2', '0']);
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
  const questionTitle = host.querySelector('.records-title')!;
  expect(questionTitle.querySelector('.records-title__next')).toBeNull();
  expect(questionTitle.querySelector('[role="progressbar"]')).toBeNull();
  expect(host.querySelector('.records-title__total')!.textContent).toContain('3,000回');
});


function materialStore(count: number) {
  const store = emptyStore();
  store.materials = [{ id: 'material', title: '編集後の教材名', url: 'https://example.com/current', comment: '編集後のコメント', createdAt: '2020-01-01T00:00:00Z', updatedAt: '2026-10-05T00:00:00Z' }];
  store.materialStudyEvents = Array.from({ length: count }, (_, index) => ({
    id: `event-${index}`, materialId: 'material', at: new Date(2026, 9, 5, 8, index).toISOString(),
    title: `学習時の教材名 ${index}`, url: `https://example.com/saved?lesson=${index}`, comment: `残した学習内容 ${index}`,
  }));
  return store;
}

it('shows separate current titles, material counts and three explicitly identified chart series', async () => {
  const store = materialStore(5);
  store.daily = { '2026-10-05': { tested: 6, confirmed: 4 } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  await mount();
  const titles = host.querySelectorAll('.records-titles .records-title');
  expect(titles).toHaveLength(2);
  expect(titles[0]!.textContent).toContain('問題学習の称号');
  expect(titles[0]!.querySelector('h2')!.textContent).toBe('はじめの一打');
  expect(titles[0]!.querySelector('.records-title__total')!.textContent).toBe('問題の学習回数10回');
  expect(titles[1]!.textContent).toContain('教材学習の称号');
  expect(titles[1]!.querySelector('h2')!.textContent).toBe('学びの積み重ね');
  expect(titles[1]!.querySelector('.records-title__definition')!.textContent).toBe('教材の「学習した」で残した記録の合計回数');
  expect(host.querySelector('.count-pill')!.textContent).toBe('問題の連続学習 1 日');
  for (const value of ['daily', 'weekly', 'monthly']) {
    expect(panel(value).querySelectorAll('polyline')).toHaveLength(3);
    expect(panel(value).querySelector('[role="img"]')!.getAttribute('aria-label')).toContain('テスト6回、確認4回、教材5回');
    expect([...panel(value).querySelectorAll('tfoot td')].map((cell) => cell.textContent)).toEqual(['6', '4', '5']);
    expect([...panel(value).querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual([value === 'daily' ? '日付' : '期間', 'テスト', '確認', '教材']);
  }
  const history = host.querySelector('.records-material-history')!;
  expect(host.querySelector('.records-history')!.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(history.querySelectorAll(':scope > .records-material-history__list > li')).toHaveLength(3);
  expect(history.querySelector('details')!.open).toBe(false);
  expect(history.querySelector('details summary')!.textContent).toBe('過去の記録を見る（2件）');
  await act(async () => history.querySelector<HTMLElement>('details summary')!.click());
  expect(history.querySelector('details')!.open).toBe(true);
});

it('displays imported historical title, comment and URL snapshots rather than current material content', async () => {
  const incoming = materialStore(1);
  incoming.materialStudyEvents![0] = {
    ...incoming.materialStudyEvents![0]!, at: new Date(2020, 0, 2, 9, 30).toISOString(),
    title: '昔の教材 <script>alert(1)</script>', comment: '押し引きの振り返り\n<script>保存した文字</script>',
    url: 'https://example.com/saved?position=60#review',
  };
  const repo = new LocalStorageRepository();
  expect(repo.importJson(emptyStore(), JSON.stringify(incoming), 'replace').ok).toBe(true);
  await mount();
  const history = host.querySelector('.records-material-history')!;
  expect(history.querySelector('h3')!.textContent).toBe('昔の教材 <script>alert(1)</script>');
  expect(history.querySelector('.records-material-history__comment')!.textContent).toBe('押し引きの振り返り\n<script>保存した文字</script>');
  expect(history.querySelector('time')!.textContent).toContain('2020/1/2');
  expect(history.querySelector('time')!.getAttribute('datetime')).toBe(incoming.materialStudyEvents![0]!.at);
  expect(history.querySelector('script')).toBeNull();
  expect(history.textContent).not.toContain('編集後');
  const link = history.querySelector('a')!;
  expect(link.href).toBe('https://example.com/saved?position=60#review');
  expect(link.target).toBe('_blank');
  expect(link.rel).toBe('noopener noreferrer');
  expect(host.querySelectorAll('.records-title h2')[1]!.textContent).toBe('学びの一歩');
  expect(panel('monthly').querySelector('tfoot td:last-child')!.textContent).toBe('0');
});

it('does not render unsafe event URLs as links and keeps their visible text escaped', async () => {
  const events: MaterialStudyEvent[] = ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'https://user:secret@example.com/lesson'].map((url, index) => ({
    id: String(index), materialId: 'material', at: new Date(2026, 9, 5, 12).toISOString(), title: '<img src=x onerror=alert(1)>', url, comment: '保存時の内容',
  }));
  await act(async () => root.render(<MaterialStudyHistory events={events} />));
  expect(host.querySelectorAll('a')).toHaveLength(0);
  expect(host.querySelectorAll('img, script')).toHaveLength(0);
  expect(host.querySelector('h3')!.textContent).toBe('<img src=x onerror=alert(1)>');
});

it('updates history, material title and all chart periods after undo without changing problem records', async () => {
  const store = materialStore(5);
  store.daily = { '2026-10-04': { tested: 4, confirmed: 1 }, '2026-10-05': { tested: 3, confirmed: 2 } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  function UndoControl() {
    const { undoMaterialStudy } = useApp();
    return <button onClick={() => undoMaterialStudy('event-4')}>学習記録を戻す</button>;
  }
  await act(async () => root.render(<AppProvider><UndoControl /><RecordsPage /></AppProvider>));
  expect(host.querySelectorAll('.records-title h2')[1]!.textContent).toBe('学びの積み重ね');
  const questionCard = host.querySelector('.records-title')!.textContent;
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(host.querySelector('.records-title')!.textContent).toBe(questionCard);
  expect(host.querySelector('.count-pill')!.textContent).toBe('問題の連続学習 2 日');
  expect(host.querySelectorAll('.records-title h2')[1]!.textContent).toBe('学びの一歩');
  expect(host.querySelector('.records-material-history')!.textContent).not.toContain('学習時の教材名 4');
  for (const value of ['daily', 'weekly', 'monthly']) expect(panel(value).querySelector('tfoot td:last-child')!.textContent).toBe('4');
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  expect(saved.materialStudyEvents).toHaveLength(4);
  expect(saved.daily).toEqual(store.daily);
  expect(saved.attempts).toEqual(store.attempts);
});
