import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '@/app/App';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { emptyStore, STORAGE_KEY, type Store } from '@/domain/types';
import { DEFAULT_SHARE_OPTIONS, decodeSharePayload, encodeSharePayload, extractSharePayload } from '@/domain/share';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubEnv('BASE_URL', './');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState({}, '', '/mj_study/');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); window.history.replaceState({}, '', '/');
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
function source() {
  const p = createLegacySampleProblems().problems[0]!;
  return { ...p, title: '受信する問題', privateMemo: '共有しない私用メモ', attachments: [] };
}
function readStore(): Store { return JSON.parse(localStorage.getItem(STORAGE_KEY)!); }
function button(label: string) {
  const item = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label);
  if (!item) throw new Error(`Missing button: ${label}`);
  return item;
}
async function mount(hash: string, store = emptyStore()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.history.replaceState({}, '', `/mj_study/${hash}`);
  await act(async () => root.render(<App />));
}
async function click(label: string) { await act(async () => button(label).click()); }

it('previews without saving, imports only on request, preserves existing data, and reaches the saved detail', async () => {
  const p = source();
  const encoded = encodeSharePayload(extractSharePayload(p, [], DEFAULT_SHARE_OPTIONS));
  const initial = emptyStore();
  initial.problems = [{ ...p, id: 'existing', title: 'もとの問題' }];
  await mount(`#share=${encoded}`, initial);
  expect(host.textContent).toContain('共有プレビュー（読取専用）');
  expect(readStore().problems).toEqual(initial.problems);
  await click('自分の学習帳に追加');
  const saved = readStore();
  expect(saved.problems).toHaveLength(2);
  expect(saved.problems[0]).toEqual(initial.problems[0]);
  const added = saved.problems[1]!;
  expect(added.id).not.toBe(p.id);
  expect(added.title).toBe(p.title);
  expect(added.concealed).toEqual(p.concealed);
  expect(added.drawn).toBe(p.drawn);
  expect(added.acceptedDiscards).toEqual(p.acceptedDiscards);
  expect(added.privateMemo).toBe('');
  expect(added.attachments).toEqual([]);
  expect(saved.attempts).toEqual([]);
  expect(window.location.hash).toBe(`#/problems/${added.id}`);
  expect(host.textContent).not.toContain('共有プレビュー（読取専用）');
  expect(host.querySelector('h1')?.textContent).toBe(p.title);
  await act(async () => {
    window.history.back();
    await vi.waitFor(() => expect(window.location.hash).toBe(`#share=${encoded}`));
  });
  expect(host.textContent).toContain('共有プレビュー（読取専用）');
  expect(host.textContent).toContain('似た問題が既にあります');
  expect(readStore().problems).toHaveLength(2);
  await act(async () => {
    window.history.forward();
    await vi.waitFor(() => expect(window.location.hash).toBe(`#/problems/${added.id}`));
  });
  expect(host.querySelector('h1')?.textContent).toBe(p.title);
  expect(readStore().problems).toHaveLength(2);
});

it.each(['', 'v9.abc', '%E0%A4%A', 'v1.!!!'])('shows an error for invalid payload %s and returns without saving', async encoded => {
  await mount(`#share=${encoded}`);
  const before = localStorage.getItem(STORAGE_KEY);
  expect(host.textContent).toContain('共有の取込');
  expect(host.querySelector('.error')).not.toBeNull();
  expect(host.textContent).not.toContain('自分の学習帳に追加');
  await click('学習帳へ戻る');
  expect(window.location.hash).toBe('#/library');
  expect(host.querySelector('h1')?.textContent).toBe('学習帳');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});

it('keeps route query parameters from becoming an incoming share', async () => {
  await mount('#/library?source=link&share=v1.abc');
  expect(host.querySelector('h1')?.textContent).toBe('学習帳');
  expect(host.textContent).not.toContain('共有の取込');
  expect(readStore().problems).toHaveLength(0);
});

it('generates a usable subpath URL from the real detail and excludes private fields', async () => {
  const p = source();
  const store = emptyStore(); store.problems = [p];
  await mount(`#/problems/${p.id}`, store);
  host.querySelector<HTMLDetailsElement>('.detail-tools')!.open = true;
  await click('共有URLを生成');
  const url = new URL(host.querySelector<HTMLTextAreaElement>('.share-box textarea')!.value);
  expect(url.origin).toBe(window.location.origin);
  expect(url.pathname).toBe('/mj_study/');
  const result = decodeSharePayload(new URLSearchParams(url.hash.slice(1)).get('share')!);
  expect(result.ok).toBe(true);
  expect(JSON.stringify(result)).not.toContain(p.privateMemo);
  expect(JSON.stringify(result)).not.toContain('attachments');
});

it('keeps the preview and existing store when a requested import cannot be saved', async () => {
  const encoded = encodeSharePayload(extractSharePayload(source(), [], DEFAULT_SHARE_OPTIONS));
  await mount(`#share=${encoded}`);
  const before = localStorage.getItem(STORAGE_KEY);
  const originalSetItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === STORAGE_KEY) throw new DOMException('Test quota failure', 'QuotaExceededError');
    return originalSetItem.call(this, key, value);
  });
  await click('自分の学習帳に追加');
  expect(host.textContent).toContain('共有プレビュー（読取専用）');
  expect(host.querySelector('.error')).not.toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  expect(window.location.hash).toBe(`#share=${encoded}`);
});

it('accepts repeated activations only once and leaves no missing problem in Back history', async () => {
  const encoded = encodeSharePayload(extractSharePayload(source(), [], DEFAULT_SHARE_OPTIONS));
  await mount(`#share=${encoded}`);
  const add = button('自分の学習帳に追加');
  await act(async () => { add.click(); add.click(); });
  const saved = readStore();
  expect(saved.problems).toHaveLength(1);
  expect(window.location.hash).toBe(`#/problems/${saved.problems[0]!.id}`);
  await act(async () => {
    window.history.back();
    await vi.waitFor(() => expect(window.location.hash).toBe(`#share=${encoded}`));
  });
  expect(host.textContent).toContain('共有プレビュー（読取専用）');
  expect(host.textContent).not.toContain('問題が見つかりません');
  expect(readStore().problems).toHaveLength(1);
});
