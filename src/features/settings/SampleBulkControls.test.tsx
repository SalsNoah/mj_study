import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { createSampleProblems } from '@/data/samples';
import { emptyStore, STORAGE_KEY, type Store } from '@/domain/types';
import { SampleCatalogManager } from './SampleCatalogManager';
import { SampleCatalogSettings } from './SampleCatalogSettings';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((entry) => entry.textContent === text)!;
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function key(value: string, shiftKey = false) { await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true }))); }
const saved = (): Store => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
function fixture(): Store {
  const store = emptyStore();
  store.tags = [{ id: 'sample-tag', name: 'サンプル' }];
  store.problems = createSampleProblems().problems.map((problem) => ({ ...problem, tagIds: ['sample-tag'] }));
  return store;
}
async function mount(store?: Store) {
  if (store) localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  await act(async () => root.render(<AppProvider><SampleCatalogManager inline /></AppProvider>));
}

it('shows a disabled empty removal action and adds all ten samples once', async () => {
  await mount();
  expect(button('一括削除できるサンプルはありません').disabled).toBe(true);
  await click(button('サンプル10題を追加'));
  expect(saved().problems).toHaveLength(10);
  expect(saved().problems.filter((problem) => problem.answerEnabled)).toHaveLength(8);
  expect(button('サンプル10題を一括削除').disabled).toBe(false);
  const raw = localStorage.getItem(STORAGE_KEY);
  await click(button('この10題は追加済み'));
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

it.each(['cancel', 'escape', 'outside'] as const)('shows target titles and preserves exact saved data on %s', async (how) => {
  const store = fixture();
  store.problems[0]!.privateMemo = '自分の編集';
  await mount(store);
  const original = localStorage.getItem(STORAGE_KEY);
  const trigger = button('サンプル9題を一括削除');
  await click(trigger);
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.textContent).toContain('サンプル9題を削除しますか？');
  expect(dialog.querySelectorAll('li')).toHaveLength(9);
  expect([...dialog.querySelectorAll('li')].map((entry) => entry.textContent)).toEqual(store.problems.slice(1).map(({ title }) => title));
  expect(document.activeElement).toBe(button('キャンセル'));
  await click(dialog.querySelector('p')!);
  expect(document.querySelector('[role="dialog"]')).toBe(dialog);
  if (how === 'cancel') await click(button('キャンセル'));
  if (how === 'escape') await key('Escape');
  if (how === 'outside') await click(document.querySelector<HTMLElement>('.duplicate-confirmation-backdrop')!);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(original);
  expect(localStorage.length).toBe(1);
});

it('traps focus, ignores repeated activation, and restores through the shared backup controls', async () => {
  const store = fixture();
  await mount(store);
  const trigger = button('サンプル10題を一括削除');
  await act(async () => { trigger.click(); trigger.click(); });
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  const content = document.querySelector<HTMLElement>('[role="dialog"] [role="region"]')!;
  expect(content.tabIndex).toBe(0);
  content.focus();
  await key('Tab', true);
  expect(document.activeElement).toBe(button('10題を削除する'));
  await key('Tab');
  expect(document.activeElement).toBe(content);
  const confirm = button('10題を削除する');
  await act(async () => { confirm.click(); confirm.click(); });
  expect(saved().problems).toHaveLength(0);
  expect(saved().sampleCatalogUpdates).toHaveLength(1);
  expect(localStorage.length).toBe(2);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.textContent).toContain('学習履歴と教材の記録は残しています');
  expect(document.activeElement).toBe(host.querySelector('[role="status"]'));
  await click(button('更新前の問題を復元'));
  expect(saved().problems).toEqual(store.problems);
  expect(button('復元済み').disabled).toBe(true);
});

it('reports a failed backup write without changing the library or losing the retry action', async () => {
  await mount(fixture());
  const original = localStorage.getItem(STORAGE_KEY);
  const set = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.startsWith(`${STORAGE_KEY}:sample-catalog-backup:`)) throw new DOMException('full', 'QuotaExceededError');
    set.call(this, key, value);
  });
  await click(button('サンプル10題を一括削除'));
  await click(button('10題を削除する'));
  expect(localStorage.getItem(STORAGE_KEY)).toBe(original);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('データは変更していません');
  expect(document.activeElement).toBe(host.querySelector('[role="alert"]'));
  expect(button('サンプル10題を一括削除').disabled).toBe(false);
});

it('passes the displayed snapshot of target IDs even when props change before confirmation', async () => {
  const onRemove = vi.fn(() => ({ ok: false as const, reason: '削除対象が変わりました' }));
  const render = (ids: string[]) => <SampleCatalogSettings inline
    preview={{ candidates: [], additions: 0, preservedEdited: 0 }}
    removalPreview={{ candidates: ids.map((id) => ({ id, title: id })) }}
    backups={[]} backupError={null} onApply={() => ({ ok: true })} onRemove={onRemove}
    onRestore={() => ({ ok: true })} onExportBackup={() => ({ ok: true, text: '{}' })} />;
  await act(async () => root.render(render(['one', 'two'])));
  await click(button('サンプル2題を一括削除'));
  await act(async () => root.render(render(['one'])));
  await click(button('2題を削除する'));
  expect(onRemove).toHaveBeenCalledExactlyOnceWith(['one', 'two']);
  expect(host.querySelector('[role="alert"]')!.textContent).toBe('削除対象が変わりました');
});


it('reports the number of later copies preserved during restoration', async () => {
  await act(async () => root.render(<SampleCatalogSettings inline
    preview={{ candidates: [], additions: 0, preservedEdited: 0 }} removalPreview={{ candidates: [] }}
    backups={[{ id: 'backup', createdAt: '2026-10-06T00:00:00Z', restoredAt: null, removedCount: 10, addedCount: 0 }]}
    backupError={null} onApply={() => ({ ok: true })} onRemove={() => ({ ok: true })}
    onRestore={() => ({ ok: true, preservedCopies: 2 })} onExportBackup={() => ({ ok: true, text: '{}' })} />));
  await click(button('更新前の問題を復元'));
  expect(host.querySelector('[role="status"]')!.textContent).toContain('同じサンプル2題も残しています');
});
