import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

function button(text: string): HTMLButtonElement {
  const result = [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === text);
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
  await click(host.querySelector<HTMLElement>('.material-card')!);
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
