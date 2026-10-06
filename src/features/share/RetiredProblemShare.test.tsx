import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { inflateRawSync } from 'node:zlib';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App, { createAppRouter } from '@/app/App';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { createSampleProblems } from '@/data/samples';
import { emptyStore, STORAGE_KEY, type Store } from '@/domain/types';
import { LocalStorageRepository } from '@/storage/repository';
import legacy from '@/test/fixtures/legacy-problem-share.json';

let host: HTMLDivElement;
let root: Root;
let router: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState({}, '', '/mj_study/');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  router?.dispose(); host.remove(); window.history.replaceState({}, '', '/');
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function fixture(): Store {
  const p = createLegacySampleProblems().problems[0]!;
  const when = '2026-10-01T00:00:00.000Z';
  return {
    ...emptyStore(), revision: 9,
    problems: [{ ...p, id: 'already-imported', title: '以前に取り込んだ問題', privateMemo: '手元のメモ',
      attachments: [{ id: 'image', role: 'question', dataUrl: 'data:image/png;base64,AQ==', width: 1, height: 1 }] },
      { ...p, id: 'custom', title: '自作の問題' }, createSampleProblems().problems[0]!],
    study: [{ problemId: 'already-imported', contentRevision: 2, confirmationCount: 3, lastConfirmedAt: when,
      understanding: 'understood', lastReviewedAt: when, lastSolvedAt: when, lastCorrectAt: when, inTest: false }],
    attempts: [{ id: 'attempt', problemId: 'already-imported', contentRevision: 2, sessionId: 'session',
      questionIndex: 0, at: when, selectedTile: p.acceptedDiscards[0]!, result: 'correct' }],
    daily: { '2026-10-01': { tested: 1, confirmed: 3 } },
    materials: [{ id: 'material', title: '保存した教材', url: 'https://example.com/lesson', comment: '教材のメモ',
      createdAt: when, updatedAt: when, sourceIds: ['original-material'] }],
    materialStudyEvents: [{ id: 'material-event', materialId: 'material', title: '保存した教材',
      url: 'https://example.com/lesson', comment: '復習記録', at: when, sourceIds: ['original-event'] }],
  };
}
function button(label: string) {
  const item = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label);
  if (!item) throw new Error(`Missing button: ${label}`);
  return item;
}
async function mount(hash: string, store = fixture()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.history.replaceState({}, '', `/mj_study/${hash}`);
  router = createAppRouter();
  await act(async () => root.render(<App router={router} />));
}
async function click(label: string) { await act(async () => button(label).click()); }
function expectRetired() {
  expect(host.querySelector('h1')?.textContent).toBe('問題共有は終了しました');
  expect(host.textContent).not.toContain(legacy.title);
  expect(host.textContent).not.toContain(legacy.payload.explanation);
  expect(host.textContent).not.toContain('自分の学習帳に追加');
  expect(host.querySelector('.hand-board, .share-box, input, textarea, img')).toBeNull();
  expect(button('学習帳へ戻る')).toBeDefined();
}

it('uses a frozen, well-formed pre-retirement v1 URL as its compatibility fixture', () => {
  expect(JSON.parse(inflateRawSync(Buffer.from(legacy.hash.slice('#share=v1.'.length), 'base64url')).toString())).toEqual(legacy.payload);
});

it.each([legacy.hash, '#share', '#share=', '#share=v9.abc', '#share=%E0%A4%A', '#share=v1.!!!',
  '#share=v1%2Eabc', '#share=<img src=x onerror=alert(1)>', `#share=${'a'.repeat(10000)}`])(
  'leaves a retired link inert and returns without touching existing data (%s)', async (hash) => {
    const initial = fixture();
    const decode = vi.spyOn(window, 'atob');
    await mount(hash, initial);
    const stored = JSON.stringify(initial);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expectRetired();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);
    expect(decode).not.toHaveBeenCalled();
    await click('学習帳へ戻る');
    expect(window.location.hash).toBe('#/library');
    expect(host.querySelector('h1')?.textContent).toBe('学習帳');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);
    expect(write).not.toHaveBeenCalled();
  },
);

it('keeps old links inert after return, repeated Back/Forward and an app remount', async () => {
  await mount(legacy.hash);
  const before = localStorage.getItem(STORAGE_KEY);
  await click('学習帳へ戻る');
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      window.history.back();
      await vi.waitFor(() => expect(window.location.hash).toBe(legacy.hash));
    });
    expectRetired();
    await act(async () => {
      window.history.forward();
      await vi.waitFor(() => expect(window.location.hash).toBe('#/library'));
    });
    expect(host.querySelector('h1')?.textContent).toBe('学習帳');
  }
  await act(async () => {
    window.history.back();
    await vi.waitFor(() => expect(window.location.hash).toBe(legacy.hash));
  });
  await act(async () => root.unmount()); router.dispose();
  root = createRoot(host); router = createAppRouter();
  await act(async () => root.render(<App router={router} />));
  expectRetired();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});

it('does not mistake query parameters or ordinary route fragments for retired links', async () => {
  await mount('#/library?source=link&share=v1.abc#share=');
  expect(host.querySelector('h1')?.textContent).toBe('学習帳');
  expect(host.textContent).not.toContain('問題共有は終了しました');
});

it('preserves existing imported/custom problems, histories, material identities and schema in JSON backups', async () => {
  const initial = fixture();
  await mount(legacy.hash, initial);
  await click('学習帳へ戻る');
  const repo = new LocalStorageRepository();
  const backupRepo = new LocalStorageRepository('retired-share-backup-test');
  try {
    const loaded = repo.load();
    if (!loaded.ok) throw new Error(loaded.reason);
    const exported = JSON.parse(repo.exportJson(loaded.store));
    expect(exported).toEqual(initial);
    const restored = backupRepo.importJson(emptyStore(), JSON.stringify(exported), 'replace');
    if (!restored.ok) throw new Error(restored.reason);
    expect(restored.store).toEqual({ ...initial, revision: restored.store.revision });
    expect(restored.store.schemaVersion).toBe(1);
    expect(restored.store.problems[2]!.sample).toEqual(initial.problems[2]!.sample);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(initial));
  } finally { repo.dispose(); backupRepo.dispose(); }
});

it('keeps problem tools compact and the separate record-share and creator-X entries available', async () => {
  await mount('#/problems/already-imported');
  const before = localStorage.getItem(STORAGE_KEY);
  const tools = host.querySelector<HTMLDetailsElement>('.detail-tools')!;
  tools.open = true;
  expect(tools.querySelector('summary')?.textContent).toBe('その他');
  expect([...tools.querySelectorAll('button')].map(item => item.textContent?.trim())).toEqual(['複製', '削除']);
  expect(tools.querySelector('section, textarea, input')).toBeNull();
  expect(host.textContent).not.toContain('共有');
  await act(async () => { await router.navigate('/edit/already-imported'); });
  expect(host.textContent).not.toContain('共有');
  expect(host.querySelector('textarea')?.value).toBeDefined();
  await act(async () => { await router.navigate('/records'); });
  expect(button('Xに記録を投稿')).toBeDefined();
  await act(async () => { await router.navigate('/settings'); });
  const creator = host.querySelector<HTMLAnchorElement>('a[aria-label="製作者のX（新しいタブで開く）"]');
  expect(creator?.href).toBe('https://x.com/Sals_mj');
  expect(creator?.target).toBe('_blank');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});
