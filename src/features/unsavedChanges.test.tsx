import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App, { createAppRouter } from '@/app/App';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { emptyStore, STORAGE_KEY, type Store } from '@/domain/types';
import { compressImageFile } from '@/export/renderTiles';
import { putImportDraft } from '@/features/import/draft';

vi.mock('@/export/renderTiles', async (original) => ({
  ...await original<typeof import('@/export/renderTiles')>(), compressImageFile: vi.fn(),
}));

let host: HTMLDivElement;
let root: Root;
let router: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.mocked(compressImageFile).mockReset();
  localStorage.clear(); sessionStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  router?.dispose(); host.remove();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function fixture() {
  const store = emptyStore();
  const problem = createLegacySampleProblems().problems[0]!;
  store.problems = [{ ...problem, id: 'problem-a', title: '元の問題' }, { ...problem, id: 'problem-b', title: '別の問題' }];
  store.study = store.problems.map(p => ({ problemId: p.id, contentRevision: 0, confirmationCount: 3,
    lastConfirmedAt: null, understanding: 'unrated', lastReviewedAt: null, lastSolvedAt: null, lastCorrectAt: null, inTest: true }));
  store.materials = ['a', 'b'].map(id => ({ id: `material-${id}`, title: `教材${id}`, url: `https://example.com/${id}`,
    comment: '元のコメント', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }));
  store.materialStudyEvents = [];
  return store;
}
async function mount(path = '/edit/problem-a', store = fixture()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.history.replaceState({}, '', `/mj_study/#${path}`);
  router = createAppRouter();
  await act(async () => root.render(<StrictMode><App router={router} /></StrictMode>));
}
const persisted = (): Store => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const heading = () => host.querySelector('h1')!.textContent;
function button(text: string, scope: ParentNode = document): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
function field(text: string): HTMLInputElement | HTMLTextAreaElement {
  const label = [...host.querySelectorAll('label')].find(item => item.querySelector('span')?.textContent === text);
  if (!label) throw new Error(`Missing field: ${text}`);
  return label.querySelector('input,textarea')!;
}
function nav(text = '学習帳'): HTMLAnchorElement {
  return [...host.querySelectorAll<HTMLAnchorElement>('.bottom-nav a')].find(item => item.textContent === text)!;
}
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function unloadPrevented() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
async function navigate(path: string) { await act(async () => { await router.navigate(path); }); }
async function backBlocked() {
  await act(async () => {
    window.history.back();
    await vi.waitFor(() => expect([...router.state.blockers.values()].some(item => item.state === 'blocked')).toBe(true));
    await vi.waitFor(() => expect(window.location.hash).toBe(`#${router.state.location.pathname}`));
  });
}

it('protects changed problem titles, traps focus, and restores the navigation link on Stay and Escape', async () => {
  await mount();
  const before = localStorage.getItem(STORAGE_KEY);
  expect(unloadPrevented()).toBe(false);
  await input(field('タイトル（任意）'), '消したくない問題');
  expect(unloadPrevented()).toBe(true);
  const link = nav(); link.focus(); await click(link);
  expect(heading()).toBe('問題を編集');
  expect(dialog()!.textContent).toContain('変更を保存しますか？');
  expect(document.activeElement).toBe(button('この画面に残る'));
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })));
  expect(document.activeElement).toBe(button('保存して移動'));
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
  expect(document.activeElement).toBe(button('この画面に残る'));
  await click(button('この画面に残る'));
  expect(dialog()).toBeNull(); expect(document.activeElement).toBe(link);
  expect(field('タイトル（任意）').value).toBe('消したくない問題');
  await click(link);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(dialog()).toBeNull(); expect(document.activeElement).toBe(link);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});

it('discards only after confirmation and reopens the saved original, with no unload warning left behind', async () => {
  await mount(); const before = persisted();
  await input(field('タイトル（任意）'), '破棄する');
  await click(nav()); await click(button('保存せずに移動'));
  expect(heading()).toBe('学習帳'); expect(unloadPrevented()).toBe(false);
  expect(persisted()).toEqual(before);
  await navigate('/edit/problem-a');
  expect(field('タイトル（任意）').value).toBe('元の問題');
  expect(unloadPrevented()).toBe(false);
});

it('saves once to the requested destination and preserves problem study and attempt counts', async () => {
  await mount(); const before = persisted();
  await input(field('タイトル（任意）'), '保存した問題');
  await click(nav());
  const save = button('保存して移動');
  await act(async () => { save.click(); save.click(); });
  expect(heading()).toBe('学習帳'); expect(dialog()).toBeNull(); expect(unloadPrevented()).toBe(false);
  expect(persisted().problems[0]!.title).toBe('保存した問題');
  expect(persisted().revision).toBe(before.revision + 1);
  expect(persisted().study).toEqual(before.study); expect(persisted().attempts).toEqual(before.attempts);
});

it('does not prompt for unchanged values, view toggles, edit then revert, or after explicit save', async () => {
  await mount();
  await input(field('タイトル（任意）'), '一時的'); await input(field('タイトル（任意）'), '元の問題');
  await click(host.querySelector('.editor-notes summary')!);
  expect(unloadPrevented()).toBe(false);
  await click(nav()); expect(heading()).toBe('学習帳'); expect(dialog()).toBeNull();
  await navigate('/edit/problem-a');
  await input(field('タイトル（任意）'), '保存済み'); await click(button('保存'));
  expect(dialog()).toBeNull(); expect(unloadPrevented()).toBe(false);
  expect(heading()).toBe('保存済み');
});

it.each(['invalid score', 'unfinished tag', 'bad URL'])('preserves %s and cancels pending navigation when Save fails validation', async (kind) => {
  await mount(); const before = persisted();
  if (kind === 'invalid score') await input(host.querySelector<HTMLInputElement>('input[aria-label="東の点数（百点単位）"]')!, 'bad');
  else if (kind === 'unfinished tag') await input(host.querySelector<HTMLInputElement>('input[placeholder="新しいタグ"]')!, '追加前');
  else await input(field('出典URL'), 'javascript:bad');
  expect(unloadPrevented()).toBe(true);
  await click(nav()); await click(button('保存して移動'));
  expect(dialog()).toBeNull(); expect(heading()).toBe('問題を編集');
  expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(persisted()).toEqual(before);
  expect(unloadPrevented()).toBe(true);
  // Fixing the form must not execute a previously requested navigation.
  await input(field('タイトル（任意）'), '修正中'); expect(heading()).toBe('問題を編集');
});

it('keeps a failed save draft and allows a fresh save-and-leave retry without duplication', async () => {
  await mount(); const revision = persisted().revision;
  await input(field('タイトル（任意）'), '容量不足でも保持');
  await click(nav());
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('full', 'QuotaExceededError'); });
  await click(button('保存して移動'));
  expect(dialog()).toBeNull(); expect(field('タイトル（任意）').value).toBe('容量不足でも保持');
  expect(persisted().revision).toBe(revision); expect(unloadPrevented()).toBe(true);
  await click(nav()); await click(button('保存して移動'));
  expect(heading()).toBe('学習帳'); expect(persisted().revision).toBe(revision + 1);
});

it('protects Back and Forward with real hash history and stays on the editor after cancellation', async () => {
  await mount('/library'); await navigate('/edit/problem-a');
  await input(field('タイトル（任意）'), '戻る前の変更');
  await backBlocked(); await click(button('この画面に残る'));
  expect(window.location.hash).toBe('#/edit/problem-a'); expect(field('タイトル（任意）').value).toBe('戻る前の変更');
  await backBlocked();
  await act(async () => {
    button('保存して移動').click();
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/library'));
  });
  expect(heading()).toBe('学習帳'); expect(persisted().problems[0]!.title).toBe('戻る前の変更');
  await act(async () => {
    window.history.forward();
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/edit/problem-a'));
  });
  expect(field('タイトル（任意）').value).toBe('戻る前の変更'); expect(unloadPrevented()).toBe(false);
});

it('follows the newest blocked navigation and remounts the next problem without inheriting the draft', async () => {
  await mount(); await input(field('タイトル（任意）'), '問題Aの未保存');
  await click(nav()); await navigate('/edit/problem-b');
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  await click(button('保存せずに移動'));
  expect(window.location.hash).toBe('#/edit/problem-b');
  expect(field('タイトル（任意）').value).toBe('別の問題'); expect(unloadPrevented()).toBe(false);
  expect(persisted().problems[0]!.title).toBe('元の問題');
});

it('protects new imported drafts and creates exactly one problem and study state on save-and-leave', async () => {
  const store = fixture(); const originalCount = store.problems.length;
  putImportDraft({ concealed: ['1m'], melds: [], doraIndicators: [], context: store.problems[0]!.context });
  await mount('/'); expect(unloadPrevented()).toBe(true);
  await click(nav()); const save = button('保存して移動');
  await act(async () => { save.click(); save.click(); });
  expect(heading()).toBe('学習帳'); expect(persisted().problems).toHaveLength(originalCount + 1);
  expect(persisted().study).toHaveLength(store.study.length + 1); expect(persisted().attempts).toEqual([]);
});

it('warns during image preparation, disables Save, and ignores a late completion after discard', async () => {
  let finish!: (value: Awaited<ReturnType<typeof compressImageFile>>) => void;
  vi.mocked(compressImageFile).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await mount(); const before = persisted();
  const fileInput = host.querySelector<HTMLInputElement>('.attachment-editor input[type="file"]')!;
  await act(async () => {
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [new File(['x'], 'test.png', { type: 'image/png' })] });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(unloadPrevented()).toBe(true); await click(nav());
  expect(button('保存して移動').disabled).toBe(true);
  await click(button('保存せずに移動'));
  await navigate('/edit/problem-b');
  await act(async () => finish({ ok: true, dataUrl: 'data:image/png;base64,AQ==', width: 1, height: 1 }));
  expect(field('タイトル（任意）').value).toBe('別の問題');
  expect(unloadPrevented()).toBe(false); expect(persisted()).toEqual(before);
  expect(host.querySelectorAll('.attachment-editor__item')).toHaveLength(0);
});

it('keeps the guard active after an upload finishes while its navigation dialog is open', async () => {
  let finish!: (value: Awaited<ReturnType<typeof compressImageFile>>) => void;
  vi.mocked(compressImageFile).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await mount();
  const fileInput = host.querySelector<HTMLInputElement>('.attachment-editor input[type="file"]')!;
  await act(async () => {
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [new File(['x'], 'test.png', { type: 'image/png' })] });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click(nav());
  await act(async () => finish({ ok: true, dataUrl: 'data:image/png;base64,AQ==', width: 1, height: 1 }));
  expect(button('保存して移動').disabled).toBe(false); await click(button('保存して移動'));
  expect(heading()).toBe('学習帳'); expect(persisted().problems[0]!.attachments).toHaveLength(1);
});

it.each(['/edit/problem-a', '/materials/material-a'])('does not overwrite newer saved data from %s', async (path) => {
  await mount(path);
  const label = path.startsWith('/edit') ? 'タイトル（任意）' : 'コメント';
  await input(field(label), '古い画面の変更');
  const newer = persisted(); newer.revision += 1;
  newer.problems[0]!.title = '最新の問題'; newer.materials![0]!.comment = '最新のコメント';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newer));
  await click(nav()); await click(button('保存して移動'));
  expect(dialog()).toBeNull(); expect(field(label).value).toBe('古い画面の変更');
  expect(persisted()).toEqual(newer); expect(unloadPrevented()).toBe(true);
});

it('keeps a problem draft blocked after explicitly reloading a newer store in the same tab', async () => {
  await mount(); await input(field('タイトル（任意）'), '保持する下書き');
  const newer = persisted(); newer.revision += 1; newer.problems[0]!.title = '再読込した最新版';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newer));
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(newer) })));
  await click(button('再読込'));
  expect(field('タイトル（任意）').value).toBe('保持する下書き');
  await click(nav()); await click(button('保存して移動'));
  expect(heading()).toBe('問題を編集'); expect(persisted()).toEqual(newer);
});

it('saves material title, URL and comment together without adding any learning events', async () => {
  await mount('/materials/material-a'); const before = persisted();
  await input(field('タイトル'), '保存する教材'); await input(field('URL'), 'https://example.com/new');
  await input(field('コメント'), '保存するコメント');
  expect(unloadPrevented()).toBe(true); await click(nav('学習教材'));
  const save = button('保存して移動'); await act(async () => { save.click(); save.click(); });
  expect(heading()).toBe('学習教材'); expect(unloadPrevented()).toBe(false);
  expect(persisted().materials![0]).toMatchObject({ title: '保存する教材', url: 'https://example.com/new', comment: '保存するコメント' });
  expect(persisted().materialStudyEvents).toEqual(before.materialStudyEvents);
  expect(persisted().study).toEqual(before.study); expect(persisted().attempts).toEqual(before.attempts);
  expect(persisted().revision).toBe(before.revision + 1);
});

it('keeps material comments on Stay, discards on request and remounts another material cleanly', async () => {
  await mount('/materials/material-a');
  await input(field('コメント'), '残して確認'); await click(host.querySelector<HTMLElement>('.material-back')!);
  await click(button('この画面に残る')); expect(field('コメント').value).toBe('残して確認');
  await navigate('/materials/material-b'); await click(button('保存せずに移動'));
  expect(heading()).toBe('教材b'); expect(field('コメント').value).toBe('元のコメント');
  expect(unloadPrevented()).toBe(false); expect(persisted().materials![0]!.comment).toBe('元のコメント');
});

it('clears material warnings on revert and after saving only the last remaining dirty field', async () => {
  await mount('/materials/material-a'); expect(unloadPrevented()).toBe(false);
  await input(field('コメント'), '変更'); await input(field('コメント'), '元のコメント');
  expect(unloadPrevented()).toBe(false);
  await input(field('タイトル'), '新しいタイトル'); await input(field('コメント'), '新しいコメント');
  await click(button('教材情報を保存')); expect(unloadPrevented()).toBe(true);
  await click(button('コメントを保存')); expect(unloadPrevented()).toBe(false);
  await click(nav()); expect(dialog()).toBeNull(); expect(heading()).toBe('学習帳');
});

it('preserves invalid material URLs and quota failures, then retries with no extra study event', async () => {
  await mount('/materials/material-a');
  await input(field('URL'), 'javascript:bad'); await input(field('コメント'), '失敗しても保持');
  await click(nav()); await click(button('保存して移動'));
  expect(dialog()).toBeNull(); expect(field('コメント').value).toBe('失敗しても保持');
  expect(host.querySelector<HTMLDetailsElement>('.material-edit')!.open).toBe(true);
  await input(field('URL'), 'https://example.com/fixed'); await click(nav());
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('full', 'QuotaExceededError'); });
  await click(button('保存して移動')); expect(dialog()).toBeNull(); expect(heading()).toBe('教材a');
  expect(unloadPrevented()).toBe(true); await click(nav()); await click(button('保存して移動'));
  expect(heading()).toBe('学習帳'); expect(persisted().materials![0]!.comment).toBe('失敗しても保持');
  expect(persisted().materialStudyEvents).toEqual([]);
});

it('protects material Back navigation and saves without recording study', async () => {
  await mount('/materials'); await navigate('/materials/material-a'); await input(field('コメント'), 'Backで保存');
  await backBlocked();
  await act(async () => {
    button('保存して移動').click();
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/materials'));
  });
  expect(heading()).toBe('学習教材'); expect(persisted().materials![0]!.comment).toBe('Backで保存');
  expect(persisted().materialStudyEvents).toEqual([]); expect(unloadPrevented()).toBe(false);
});

it('keeps drafts on same-page query and fragment updates and guards the next page change', async () => {
  await mount(); await input(field('タイトル（任意）'), 'クエリ更新でも保持');
  await navigate('/edit/problem-a?view=notes#memo');
  expect(dialog()).toBeNull(); expect(field('タイトル（任意）').value).toBe('クエリ更新でも保持');
  expect(unloadPrevented()).toBe(true);
  await click(nav()); expect(dialog()).not.toBeNull(); await click(button('この画面に残る'));
  await navigate('/edit/problem-a?view=hand');
  await click(nav()); expect(dialog()).not.toBeNull(); await click(button('保存して移動'));
  expect(heading()).toBe('学習帳'); expect(persisted().problems[0]!.title).toBe('クエリ更新でも保持');
});

it('exposes selected correct tiles as pressed, including duplicate tile codes, and reverts without a warning', async () => {
  const data = fixture();
  data.problems[0] = { ...data.problems[0]!, concealed: ['1m', '4z', '4z'], drawn: null,
    acceptedDiscards: ['4z'], answerEnabled: true, doraIndicators: [] };
  await mount('/edit/problem-a', data);
  const tiles = () => [...host.querySelectorAll<HTMLButtonElement>('.hand-stage--pick button[aria-label="北"]')];
  expect(tiles()).toHaveLength(2);
  for (const tile of tiles()) { expect(tile.classList.contains('is-correct')).toBe(true); expect(tile.getAttribute('aria-pressed')).toBe('true'); }
  await click(tiles()[0]!);
  for (const tile of tiles()) { expect(tile.classList.contains('is-correct')).toBe(false); expect(tile.getAttribute('aria-pressed')).toBe('false'); }
  expect(unloadPrevented()).toBe(true);
  await click(tiles()[1]!);
  for (const tile of tiles()) expect(tile.getAttribute('aria-pressed')).toBe('true');
  expect(unloadPrevented()).toBe(false);
  const one = host.querySelector<HTMLButtonElement>('.hand-stage--pick button[aria-label="一萬"]')!;
  await click(one); expect(one.getAttribute('aria-pressed')).toBe('true');
  await click(button('保存'));
  expect(persisted().problems[0]!.acceptedDiscards).toEqual(['4z', '1m']);
  expect(dialog()).toBeNull();
});

it('keeps a material draft after reloading an external deletion and only discards it explicitly', async () => {
  await mount('/materials/material-a'); await input(field('コメント'), '消えた教材の未保存コメント');
  const newer = persisted(); newer.revision += 1; newer.materials = [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newer));
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(newer) })));
  await click(button('再読込'));
  expect(field('コメント').value).toBe('消えた教材の未保存コメント'); expect(unloadPrevented()).toBe(true);
  await click(nav()); await click(button('保存して移動'));
  expect(dialog()).toBeNull(); expect(field('コメント').value).toBe('消えた教材の未保存コメント');
  expect(persisted()).toEqual(newer);
  await click(button('入力を破棄して再読込'));
  expect(heading()).toBe('教材が見つかりません'); expect(unloadPrevented()).toBe(false);
  expect(persisted()).toEqual(newer);
});

it('treats a legacy image moved back to its explanation role as unchanged without modifying storage', async () => {
  const data = fixture();
  data.problems[0]!.attachments = [{ id: 'legacy', dataUrl: 'data:image/png;base64,AQ==', width: 1, height: 1 }];
  await mount('/edit/problem-a', data); const raw = localStorage.getItem(STORAGE_KEY);
  await click(button('問題用へ移す')); expect(unloadPrevented()).toBe(true);
  await click(button('解説用へ移す')); expect(unloadPrevented()).toBe(false);
  await click(nav()); expect(heading()).toBe('学習帳'); expect(dialog()).toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
