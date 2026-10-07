import { TestRouter as MemoryRouter } from '@/test/TestRouter';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from '@/app/store';
import { BottomNav } from '@/components/BottomNav';
import { emptyStore, STORAGE_KEY, type LearningMaterial, type Store } from '@/domain/types';
import { MaterialsPage } from './MaterialsPage';
import { MaterialDetailPage } from './MaterialDetailPage';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T04:00:00.000Z'));
  localStorage.clear();
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

function material(id = 'material-a', extra: Partial<LearningMaterial> = {}): LearningMaterial {
  return { id, title: '牌効率の基本', url: 'https://example.com/lesson-a', comment: '', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...extra };
}

function seed(materials: LearningMaterial[] = [material()]): Store {
  const data = { ...emptyStore(), materials, materialStudyEvents: [] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

function persisted(): Store { return JSON.parse(localStorage.getItem(STORAGE_KEY)!); }

function ReloadControl() {
  const { reload } = useApp();
  return <button type="button" onClick={reload}>テスト用再読込</button>;
}

async function mount(path = '/materials', reloadControl = false) {
  await act(async () => root.render(
    <AppProvider><MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/materials" element={<MaterialsPage />} />
        <Route path="/materials/:id" element={<MaterialDetailPage />} />
      </Routes>
      <BottomNav />
      {reloadControl && <ReloadControl />}
    </MemoryRouter></AppProvider>,
  ));
}

function button(text: string, scope: ParentNode = host): HTMLButtonElement {
  const result = [...scope.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === text);
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
}

function field(text: string): HTMLInputElement | HTMLTextAreaElement {
  const label = [...host.querySelectorAll('label')].find((item) => item.querySelector('span')?.textContent === text);
  if (!label) throw new Error(`Missing field: ${text}`);
  return label.querySelector('input,textarea')!;
}

async function click(element: HTMLElement) { await act(async () => element.click()); }

async function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('shows an empty list with a URL form and an exact 学習教材 navigation item', async () => {
  seed([]);
  await mount();
  expect(host.textContent).toContain('教材はまだありません。');
  expect(field('URL').getAttribute('type')).toBe('url');
  const navigation = host.querySelector('[aria-label="メインナビ"]')!;
  expect([...navigation.querySelectorAll('a')].map((link) => link.textContent)).toEqual(['作成', '学習帳', 'テスト', '学習教材', '記録帳', '設定']);
  expect(navigation.querySelector('[aria-current="page"]')!.textContent).toBe('学習教材');
  expect(persisted().materialStudyEvents).toHaveLength(0);
});

it('registers a URL and title, reopens saved fields, and never counts registration or opening', async () => {
  seed([]);
  await mount();
  await input(field('URL'), 'https://www.youtube.com/watch?v=lesson-a');
  await input(field('タイトル（任意）'), '  受入れの基本  ');
  await click(button('登録する'));
  expect(host.querySelector('h1')!.textContent).toBe('受入れの基本');
  expect(host.querySelector('.material-count')!.textContent).toBe('学習 0 回');
  const external = host.querySelector<HTMLAnchorElement>('.material-open')!;
  expect(external.href).toBe('https://www.youtube.com/watch?v=lesson-a');
  expect(external.target).toBe('_blank');
  expect(external.rel).toBe('noopener noreferrer');
  await click(external);
  expect(persisted().materialStudyEvents).toHaveLength(0);
  await click(host.querySelector<HTMLElement>('.material-back')!);
  expect(host.querySelectorAll('.material-card')).toHaveLength(1);
  await click(host.querySelector<HTMLElement>('.material-record-link')!);
  expect(field('タイトル').value).toBe('受入れの基本');
  expect(field('URL').value).toBe('https://www.youtube.com/watch?v=lesson-a');
  expect(persisted().materialStudyEvents).toHaveLength(0);
});

it('uses the source hostname when the optional registration title is blank', async () => {
  seed([]);
  await mount();
  await input(field('URL'), 'https://note.com/example/n/lesson');
  await click(button('登録する'));
  expect(host.querySelector('h1')!.textContent).toBe('note.com');
});

it('keeps a duplicate registration draft and links to the existing material', async () => {
  seed();
  await mount();
  await click(button('教材を追加'));
  await input(field('URL'), 'https://EXAMPLE.com/lesson-a');
  await input(field('タイトル（任意）'), '入力したタイトル');
  await click(button('登録する'));
  expect(host.querySelector('[role="alert"] a')!.getAttribute('href')).toBe('/materials/material-a');
  expect(field('URL').value).toBe('https://EXAMPLE.com/lesson-a');
  expect(field('タイトル（任意）').value).toBe('入力したタイトル');
  expect(persisted().materials).toHaveLength(1);
  expect(persisted().materialStudyEvents).toHaveLength(0);
});

it.each(['javascript:alert(1)', 'data:text/html,hello', 'https://user:secret@example.com/lesson', 'file:///tmp/lesson'])('rejects unsafe URL %s without clearing the form', async (url) => {
  seed([]);
  await mount();
  await input(field('URL'), url);
  await input(field('タイトル（任意）'), '残すタイトル');
  await click(button('登録する'));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(field('URL').value).toBe(url);
  expect(field('タイトル（任意）').value).toBe('残すタイトル');
  expect(persisted().materials).toHaveLength(0);
});

it('saves standalone comments without learning, then atomically records the current comment and supports undo', async () => {
  seed();
  await mount('/materials/material-a');
  await input(field('コメント'), '先に保存するメモ');
  await click(button('コメントを保存'));
  expect(persisted().materials![0]!.comment).toBe('先に保存するメモ');
  expect(persisted().materialStudyEvents).toHaveLength(0);
  await input(field('コメント'), '両面を残す。\n次は複合形を確認。');
  await act(async () => { button('学習した').click(); button('学習した').click(); });
  expect(persisted().materialStudyEvents).toHaveLength(1);
  expect(persisted().materials![0]!.comment).toBe('両面を残す。\n次は複合形を確認。');
  expect(persisted().materialStudyEvents![0]).toMatchObject({ materialId: 'material-a', title: '牌効率の基本', url: 'https://example.com/lesson-a', comment: '両面を残す。\n次は複合形を確認。' });
  expect(button('学習した').disabled).toBe(true);
  expect(host.querySelector('.material-count')!.textContent).toBe('学習 1 回');
  expect(host.querySelector('.material-history-list time')!.getAttribute('datetime')).toBe('2026-10-05T04:00:00.000Z');
  expect(host.querySelector('.material-history-list')!.textContent).toContain('次は複合形を確認。');
  await click(button('直前の学習を取り消す'));
  expect(persisted().materialStudyEvents).toHaveLength(0);
  expect(host.querySelector('.material-count')!.textContent).toBe('学習 0 回');
  expect(field('コメント').value).toBe('両面を残す。\n次は複合形を確認。');
});

it('requires a separate next-study action and undoes the newest event when timestamps are identical', async () => {
  seed();
  await mount('/materials/material-a');
  await input(field('コメント'), '1回目');
  await click(button('学習した'));
  await click(button('次の学習を記録する'));
  expect(persisted().materialStudyEvents).toHaveLength(1);
  await input(field('コメント'), '2回目');
  await click(button('学習した'));
  expect(persisted().materialStudyEvents).toHaveLength(2);
  expect(host.querySelector('.material-history-list li')!.textContent).toContain('2回目');
  await click(button('直前の学習を取り消す'));
  expect(persisted().materialStudyEvents).toHaveLength(1);
  expect(persisted().materialStudyEvents![0]!.comment).toBe('1回目');
});

it('moves focus to the enabled study button when the next-study action disappears', async () => {
  seed();
  await mount('/materials/material-a');
  await click(button('学習した'));
  const next = button('次の学習を記録する');
  next.focus();
  expect(document.activeElement).toBe(next);
  await click(next);
  expect(next.isConnected).toBe(false);
  expect(button('学習した').disabled).toBe(false);
  expect(document.activeElement).toBe(button('学習した'));
  expect(persisted().materialStudyEvents).toHaveLength(1);
});

it('returns focus to the editor summary only after metadata is saved successfully', async () => {
  seed();
  await mount('/materials/material-a');
  const summary = host.querySelector('summary')!;
  const details = host.querySelector<HTMLDetailsElement>('.material-edit')!;
  await click(summary);
  await input(field('タイトル'), '編集した教材名');
  const save = button('教材情報を保存');
  save.focus();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('full', 'QuotaExceededError'); });
  await click(save);
  expect(details.open).toBe(true);
  expect(document.activeElement).toBe(save);
  await click(save);
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(summary);
  expect(persisted().materials![0]!.title).toBe('編集した教材名');
});

it('edits the title and URL while keeping historical snapshots and an unsaved comment', async () => {
  seed();
  await mount('/materials/material-a');
  await input(field('コメント'), '記録時のコメント');
  await click(button('学習した'));
  await input(field('コメント'), '未保存のコメント');
  await click(host.querySelector('summary')!);
  await input(field('タイトル'), '新しい教材名');
  await input(field('URL'), 'https://note.com/example/n/new');
  await click(button('教材情報を保存'));
  expect(host.querySelector('h1')!.textContent).toBe('新しい教材名');
  expect(host.querySelector('.material-open')!.getAttribute('href')).toBe('https://note.com/example/n/new');
  expect(field('コメント').value).toBe('未保存のコメント');
  expect(persisted().materials![0]!.comment).toBe('記録時のコメント');
  expect(persisted().materialStudyEvents![0]).toMatchObject({ title: '牌効率の基本', url: 'https://example.com/lesson-a', comment: '記録時のコメント' });
  expect(host.querySelector('.material-history-list')!.textContent).toContain('牌効率の基本');
});

it('keeps new registration input when persistence fails', async () => {
  seed([]);
  await mount();
  await input(field('URL'), 'https://example.com/fail');
  await input(field('タイトル（任意）'), '未保存');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('full', 'QuotaExceededError'); });
  await click(button('登録する'));
  expect(field('タイトル（任意）').value).toBe('未保存');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(persisted().materials).toHaveLength(0);
  await click(button('登録する'));
  expect(persisted().materials).toHaveLength(1);
});

it('keeps a comment draft on failed study persistence and retries without duplicates', async () => {
  seed();
  await mount('/materials/material-a');
  await input(field('コメント'), '失敗しても残すコメント');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('full', 'QuotaExceededError'); });
  await click(button('学習した'));
  expect(field('コメント').value).toBe('失敗しても残すコメント');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.querySelector('.material-count')!.textContent).toBe('学習 0 回');
  expect(persisted().materials![0]!.comment).toBe('');
  expect(persisted().materialStudyEvents).toHaveLength(0);
  expect(button('学習した').disabled).toBe(false);
  await click(button('学習した'));
  expect(persisted().materialStudyEvents).toHaveLength(1);
});

it('preserves and blocks a dirty draft after a newer external store is reloaded', async () => {
  seed();
  await mount('/materials/material-a', true);
  await input(field('コメント'), 'この画面の未保存コメント');
  const newer = persisted();
  newer.revision += 1;
  newer.materials![0]!.title = '別の画面のタイトル';
  newer.materials![0]!.comment = '別の画面で保存済み';
  newer.materials![0]!.updatedAt = '2026-10-05T05:00:00.000Z';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newer));
  await click(button('テスト用再読込'));
  expect(field('コメント').value).toBe('この画面の未保存コメント');
  expect(button('コメントを保存').disabled).toBe(true);
  expect(button('学習した').disabled).toBe(true);
  expect(host.querySelector('.material-conflict')!.textContent).toContain('上書きを止めています');
  expect(persisted().materials![0]!.comment).toBe('別の画面で保存済み');
  await click(button('入力を破棄して再読込'));
  expect(field('コメント').value).toBe('別の画面で保存済み');
  expect(field('タイトル').value).toBe('別の画面のタイトル');
  expect(button('コメントを保存').disabled).toBe(false);
});

it('blocks a missed external conflict on save and does not overwrite the newer record', async () => {
  seed();
  await mount('/materials/material-a');
  await input(field('コメント'), '古い画面のコメント');
  const newer = persisted();
  newer.revision += 1;
  newer.materials![0]!.comment = '最新版';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newer));
  await click(button('コメントを保存'));
  expect(field('コメント').value).toBe('古い画面のコメント');
  expect(button('コメントを保存').disabled).toBe(true);
  expect(persisted().materials![0]!.comment).toBe('最新版');
});

it('shows a direct external link and study count without navigating through the detail page', async () => {
  const original = seed([material('youtube', { title: '動画教材', url: 'https://youtu.be/7lCDEYXw3mM?si=private-token', comment: '保存済みのメモ' })]);
  original.materialStudyEvents = [{ id: 'study-one', materialId: 'youtube', title: '動画教材', url: original.materials![0]!.url, comment: '', at: '2026-10-04T00:00:00Z' }];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(original));
  await mount();
  const before = localStorage.getItem(STORAGE_KEY);
  const card = host.querySelector('.material-card')!;
  expect(card.tagName).toBe('ARTICLE');
  expect(card.querySelector('.material-count')!.textContent).toBe('学習 1 回');
  const link = card.querySelector<HTMLAnchorElement>('.material-direct-link')!;
  expect(link.href).toBe(original.materials![0]!.url);
  expect(link.target).toBe('_blank');
  expect(link.rel).toBe('noopener noreferrer');
  await click(link);
  expect(host.querySelector('h1')!.textContent).toBe('学習教材');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  await click(card.querySelector<HTMLElement>('.material-record-link')!);
  expect(field('コメント').value).toBe('保存済みのメモ');
});

it('requests only the YouTube video thumbnail without credentials or referrer and falls back on failure', async () => {
  seed([material('youtube', { url: 'https://www.youtube.com/watch?v=7lCDEYXw3mM&list=private&si=token#secret' }), material('note', { url: 'https://note.com/author/n/content' })]);
  await mount();
  const images = host.querySelectorAll('img');
  expect(images).toHaveLength(1);
  const thumbnail = images[0]!;
  expect(thumbnail.src).toBe('https://i.ytimg.com/vi/7lCDEYXw3mM/mqdefault.jpg');
  expect(thumbnail.crossOrigin).toBe('anonymous');
  expect(thumbnail.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(thumbnail.getAttribute('loading')).toBe('lazy');
  await act(async () => thumbnail.dispatchEvent(new Event('error')));
  expect(host.querySelectorAll('img')).toHaveLength(0);
  expect(host.querySelectorAll('.material-thumbnail__placeholder')).toHaveLength(2);
  expect(host.querySelectorAll('.material-direct-link')).toHaveLength(2);
});

it('filters title and URL, distinguishes no matches, and preserves the add draft and stored events', async () => {
  seed([material('a', { title: '牌効率 ＡＢＣ', url: 'https://example.com/lesson-a' }), material('b', { title: '守備', url: 'https://note.com/defense', comment: '牌効率という私用メモ' })]);
  await mount();
  const before = localStorage.getItem(STORAGE_KEY);
  await click(button('教材を追加'));
  await input(field('URL'), 'https://example.com/unsaved');
  await input(field('タイトル（任意）'), '未保存の登録');
  const search = field('教材を検索');
  await input(search, 'abc');
  expect(host.querySelectorAll('.material-card')).toHaveLength(1);
  expect(host.querySelector('.count-pill')!.textContent).toBe('1 / 2 件');
  await input(search, 'NOTE.COM');
  expect(host.querySelector('.material-card h2')!.textContent).toBe('守備');
  await input(search, '存在しない教材');
  expect(host.querySelectorAll('.material-card')).toHaveLength(0);
  expect(host.textContent).toContain('条件に合う教材はありません。');
  expect(host.textContent).not.toContain('教材はまだありません。');
  await click(button('検索をクリア'));
  expect(host.querySelectorAll('.material-card')).toHaveLength(2);
  expect(document.activeElement).toBe(search);
  expect(field('URL').value).toBe('https://example.com/unsaved');
  expect(field('タイトル（任意）').value).toBe('未保存の登録');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});

it('confirms one titled archive with preserved history, traps and returns focus, then restores after reload', async () => {
  seed(); await mount('/materials/material-a', true);
  await input(field('コメント'), '残す学習コメント'); await click(button('学習した'));
  const before = persisted(), archive = button('教材をアーカイブ');
  archive.focus(); await click(archive);
  let dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain('「牌効率の基本」1件');
  expect(dialog.textContent).toContain('学習履歴1回');
  expect(document.activeElement).toBe(button('キャンセル', dialog));
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })));
  expect(document.activeElement).toBe(button('アーカイブする', dialog));
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
  expect(document.activeElement).toBe(button('キャンセル', dialog));
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(archive);
  expect(persisted()).toEqual(before);
  await click(archive); dialog = document.querySelector('[role="dialog"]')!;
  await click(button('アーカイブする', dialog));
  expect(persisted().materials![0]!.archivedAt).toBe('2026-10-05T04:00:00.000Z');
  expect(persisted().materialStudyEvents).toEqual(before.materialStudyEvents);
  expect(field('コメント').value).toBe('残す学習コメント');
  expect(host.querySelector('.material-count')!.textContent).toBe('学習 1 回');
  expect(document.activeElement).toBe(button('学習中に復元する'));
  expect(button('学習した').disabled).toBe(true);
  expect(host.querySelector('.material-history-list')!.textContent).toContain('残す学習コメント');
  await click(button('テスト用再読込'));
  expect(button('学習した').disabled).toBe(true);
  await click(host.querySelector<HTMLElement>('.material-back')!);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(button('アーカイブ 1 件').getAttribute('aria-pressed')).toBe('true');
  expect(button('学習中 0 件').getAttribute('aria-pressed')).toBe('false');
  expect(host.querySelector('.material-record-link')!.textContent).toBe('履歴・復元');
  await click(host.querySelector<HTMLElement>('.material-record-link')!);
  const restore = button('学習中に復元する'); restore.focus(); await click(restore);
  expect(document.activeElement).toBe(button('教材をアーカイブ'));
  expect(persisted().materials![0]).not.toHaveProperty('archivedAt');
  expect(persisted().materialStudyEvents).toEqual(before.materialStudyEvents);
  expect(button('学習した').disabled).toBe(false);
  await click(host.querySelector<HTMLElement>('.material-back')!);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(button('学習中 1 件').getAttribute('aria-pressed')).toBe('true');
});

it('defaults to active materials and searches each view with correct counts and distinct empty states', async () => {
  seed([material('active', { title: '守備', url: 'https://example.com/active' }),
    material('archived', { title: '牌効率', url: 'https://example.com/archived', archivedAt: '2026-10-03T00:00:00Z' })]);
  await mount();
  const raw = localStorage.getItem(STORAGE_KEY);
  expect(host.querySelectorAll('.material-card')).toHaveLength(1);
  expect(host.querySelector('.material-card h2')!.textContent).toBe('守備');
  expect(host.querySelector('.count-pill')!.textContent).toBe('1 件');
  await input(field('教材を検索'), '牌効率');
  expect(host.textContent).toContain('条件に合う教材はありません。');
  const archiveView = button('アーカイブ 1 件'); archiveView.focus(); await click(archiveView);
  expect(document.activeElement).toBe(archiveView);
  expect(archiveView.getAttribute('aria-pressed')).toBe('true');
  expect(field('教材を検索').value).toBe('牌効率');
  expect(host.querySelector('.material-card h2')!.textContent).toBe('牌効率');
  expect(host.querySelector('.count-pill')!.textContent).toBe('1 / 1 件');
  await input(field('教材を検索'), 'example.com/active');
  expect(host.querySelectorAll('.material-card')).toHaveLength(0);
  await click(button('学習中 1 件'));
  expect(host.querySelector('.material-card h2')!.textContent).toBe('守備');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

it('shows a useful active empty state when every material is archived and supports an archived list deep link', async () => {
  seed([material('material-a', { archivedAt: '2026-10-03T00:00:00Z' })]);
  await mount();
  expect(host.textContent).toContain('学習中の教材はありません。アーカイブから復元できます。');
  expect(host.querySelectorAll('.material-card')).toHaveLength(0);
  await click(button('アーカイブ 1 件'));
  expect(host.querySelectorAll('.material-card')).toHaveLength(1);
  await click(host.querySelector<HTMLElement>('.material-record-link')!);
  expect(host.querySelector('.material-back')!.getAttribute('href')).toBe('/materials?view=archived');
  expect(host.textContent).toContain('アーカイブした教材です');
  expect(button('学習した').disabled).toBe(true);
});

it('opens the archive list directly and distinguishes an empty archive from no search matches', async () => {
  seed(); await mount('/materials?view=archived');
  expect(button('アーカイブ 0 件').getAttribute('aria-pressed')).toBe('true');
  expect(host.textContent).toContain('アーカイブした教材はありません。');
  expect(host.textContent).not.toContain('条件に合う教材はありません。');
});

it.each(['タイトル', 'URL', 'コメント'])('blocks archive until dirty %s is saved or reverted and keeps navigation protection', async (name) => {
  seed(); await mount('/materials/material-a');
  const raw = localStorage.getItem(STORAGE_KEY), original = field(name).value;
  await input(field(name), name === 'URL' ? 'https://example.com/new' : '未保存の変更');
  expect(button('教材をアーカイブ').disabled).toBe(true);
  await click(button('教材をアーカイブ'));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.textContent).toContain('タイトル・URL・コメントの変更を保存するか、元の値に戻してから操作してください。');
  await click(host.querySelector<HTMLElement>('.material-back')!);
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain('変更を保存しますか？');
  await click(button('この画面に残る', dialog));
  expect(field(name).value).not.toBe(original);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  await input(field(name), original);
  expect(button('教材をアーカイブ').disabled).toBe(false);
  await input(field(name), name === 'URL' ? 'https://example.com/new' : '保存する変更');
  await click(button(name === 'コメント' ? 'コメントを保存' : '教材情報を保存'));
  expect(button('教材をアーカイブ').disabled).toBe(false);
  expect(persisted().materialStudyEvents).toHaveLength(0);
});

it('keeps archived status while editing and disables restore until its draft is saved', async () => {
  seed([material('material-a', { archivedAt: '2026-10-03T00:00:00Z' })]);
  await mount('/materials/material-a');
  await input(field('コメント'), '整理後のメモ');
  expect(button('学習中に復元する').disabled).toBe(true);
  expect(button('学習した').disabled).toBe(true);
  await click(button('コメントを保存'));
  expect(persisted().materials![0]!.archivedAt).toBe('2026-10-03T00:00:00Z');
  expect(button('学習中に復元する').disabled).toBe(false);
  await click(button('学習中に復元する'));
  expect(field('コメント').value).toBe('整理後のメモ');
  expect(persisted().materialStudyEvents).toHaveLength(0);
});

it('offers a visible restore path for an archived duplicate without adding another material', async () => {
  seed([material('material-a', { archivedAt: '2026-10-03T00:00:00Z', comment: '残すメモ' })]);
  await mount(); await click(button('教材を追加'));
  await input(field('URL'), 'https://EXAMPLE.com/lesson-a'); await click(button('登録する'));
  const link = host.querySelector<HTMLElement>('[role="alert"] a')!;
  expect(link.textContent).toBe('アーカイブした教材を開いて復元');
  await click(link);
  expect(button('学習中に復元する').disabled).toBe(false);
  expect(field('コメント').value).toBe('残すメモ');
  expect(persisted().materials).toHaveLength(1); expect(persisted().materialStudyEvents).toHaveLength(0);
});

it('keeps archive and restore failures actionable and retries without history changes', async () => {
  seed(); await mount('/materials/material-a');
  const original = persisted();
  const archive = button('教材をアーカイブ'); archive.focus(); await click(archive);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('full', 'QuotaExceededError'); });
  await click(button('アーカイブする', document.querySelector('[role="dialog"]')!));
  expect(persisted()).toEqual(original); expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(document.activeElement).toBe(archive);
  await click(archive); await click(button('アーカイブする', document.querySelector('[role="dialog"]')!));
  const archived = persisted();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('denied'); });
  await click(button('学習中に復元する'));
  expect(persisted()).toEqual(archived); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(button('学習した').disabled).toBe(true);
  await click(button('学習中に復元する'));
  expect(persisted().materials![0]).not.toHaveProperty('archivedAt');
  expect(persisted().materialStudyEvents).toEqual(original.materialStudyEvents);
});

it('detects an external archive with the same updatedAt and retains the dirty draft until explicit reload', async () => {
  const original = seed(); await mount('/materials/material-a', true);
  await input(field('コメント'), '残す未保存メモ');
  const external = structuredClone(original);
  external.materials![0]!.archivedAt = '2026-10-03T00:00:00Z';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(external));
  await click(button('テスト用再読込'));
  expect(field('コメント').value).toBe('残す未保存メモ');
  expect(button('コメントを保存').disabled).toBe(true);
  expect(button('学習中に復元する').disabled).toBe(true);
  expect(button('学習した').disabled).toBe(true);
  await click(button('入力を破棄して再読込'));
  expect(field('コメント').value).toBe(original.materials![0]!.comment);
  expect(button('学習中に復元する').disabled).toBe(false);
  expect(button('学習した').disabled).toBe(true);
});

it('rejects archive when a newer write appears while confirmation is open', async () => {
  seed(); await mount('/materials/material-a');
  await click(button('教材をアーカイブ'));
  const external = persisted(); external.revision += 1; external.materials![0]!.comment = '別タブのコメント';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(external));
  await click(button('アーカイブする', document.querySelector('[role="dialog"]')!));
  expect(persisted()).toEqual(external);
  expect(button('教材をアーカイブ').disabled).toBe(true);
  expect(host.querySelector('.material-conflict')).not.toBeNull();
});

it('accepts repeated restore clicks without a stale conflict or an extra write', async () => {
  seed([material('material-a', { archivedAt: '2026-10-03T00:00:00Z' })]);
  await mount('/materials/material-a');
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  const restore = button('学習中に復元する');
  await act(async () => { restore.click(); restore.click(); });
  expect(persisted().materials![0]).not.toHaveProperty('archivedAt');
  expect(writes).toHaveBeenCalledTimes(1);
  expect(button('教材をアーカイブ').disabled).toBe(false);
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it('records directly from the list once on double click, keeps comment/order, and confirms a further study', async () => {
  seed([material('old', { title: '古い教材', comment: '残すコメント' }), material('new', { title: '新しい教材', url: 'https://example.com/new', updatedAt: '2026-10-04T00:00:00Z' })]);
  await mount();
  const cards = () => [...host.querySelectorAll<HTMLElement>('.material-card')];
  expect(cards().map(card => card.querySelector('h2')!.textContent)).toEqual(['新しい教材', '古い教材']);
  const study = button('学習した', cards()[1]);
  await act(async () => { study.click(); study.click(); });
  expect(persisted().materialStudyEvents).toHaveLength(1);
  expect(persisted().materials?.find(m => m.id === 'old')?.comment).toBe('残すコメント');
  expect(cards().map(card => card.querySelector('h2')!.textContent)).toEqual(['新しい教材', '古い教材']);
  expect(host.querySelector('h1')!.textContent).toBe('学習教材');
  await click(button('キャンセル', document.body));
  expect(persisted().materialStudyEvents).toHaveLength(1);
  await click(study);
  await click(button('もう1回記録する', document.body));
  expect(persisted().materialStudyEvents).toHaveLength(2);
});

it('archives from list with confirmation, retains data, focuses search, and restores without studies', async () => {
  seed([material('one', { comment: 'そのまま残す' })]); await mount();
  const before = persisted();
  const archive = button('アーカイブ');
  await click(archive); await click(button('キャンセル', document.body));
  expect(persisted()).toEqual(before); expect(document.activeElement).toBe(archive);
  await click(archive); await click(button('アーカイブする', document.body));
  expect(persisted().materials?.[0]?.archivedAt).toBeTruthy();
  expect(persisted().materials?.[0]?.comment).toBe('そのまま残す');
  expect(persisted().materialStudyEvents).toEqual(before.materialStudyEvents);
  expect(document.activeElement).toBe(host.querySelector('input[type="search"]'));
  await click(button('アーカイブ 1 件')); expect(button('学習した').disabled).toBe(true);
  await click(button('学習中に復元')); expect(persisted().materials?.[0]?.archivedAt).toBeUndefined();
});

it('list study and archive failures never claim success or remove cards',async()=>{
  seed(); await mount(); vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
  await click(button('学習した')); expect(persisted().materialStudyEvents).toHaveLength(0);expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await click(button('アーカイブ')); await click(button('アーカイブする',document.body)); expect(persisted().materials?.[0]?.archivedAt).toBeUndefined();expect(host.querySelectorAll('.material-card')).toHaveLength(1);
});
