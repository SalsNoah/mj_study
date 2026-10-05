import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RecordShareButton, xRecordComposeUrl } from './RecordShareButton';
import { renderRecordShareImage } from './renderRecordShare';
import { THEMES } from '@/app/theme';

vi.mock('./renderRecordShare', () => ({ renderRecordShareImage: vi.fn() }));
let host: HTMLDivElement;
let root: Root;
const renderer = vi.mocked(renderRecordShareImage);
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === text)!;
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const key = async (key: string, shiftKey = false) => { await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))); };
const mount = async (tested = 4) => { await act(async () => root.render(<RecordShareButton daily={{ '2026-10-05': { tested, confirmed: 2 } }} events={[]} />)); };
const open = async () => { await click(button('Xに記録を投稿')); };

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); delete document.documentElement.dataset.theme;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 5, 12));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  renderer.mockResolvedValue({ blob: new Blob(['png'], { type: 'image/png' }), fileName: 'records.png' });
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:record-preview'); static revokeObjectURL = vi.fn(); });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
});

afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  delete (navigator as Partial<Navigator>).canShare; delete (navigator as Partial<Navigator>).share;
  Reflect.deleteProperty(navigator, 'clipboard');
  localStorage.clear(); delete document.documentElement.dataset.theme;
  vi.useRealTimers(); vi.resetAllMocks(); vi.unstubAllGlobals();
});

it('generates a preview only after click and provides explicit image-save then text-only X fallback', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  const browserOpen = vi.spyOn(window, 'open');
  await mount(); expect(renderer).not.toHaveBeenCalled();
  await open();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector<HTMLImageElement>('.record-share-preview')?.src).toBe('blob:record-preview');
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.record-share-actions a')];
  expect(links[0]!.download).toBe('records.png');
  expect(new URL(links[1]!.href).searchParams.get('text')).toContain('今日：テスト4回・確認2回・教材0回');
  expect(links[1]!.rel).toBe('noopener noreferrer'); expect(links[1]!.target).toBe('_blank');
  expect(document.body.textContent).toContain('画像は自動添付されません');
  expect(button('画像付きで共有')).toBeUndefined();
  expect(document.querySelector<HTMLDetailsElement>('details')?.open).toBe(true);
  expect(storage).not.toHaveBeenCalled(); expect(browserOpen).not.toHaveBeenCalled();
});

it('shares the prepared PNG and exact preview text directly in the click, guarding double clicks', async () => {
  let resolve!: () => void;
  const share = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  await mount(); await open();
  const control = button('画像付きで共有');
  await act(async () => { control.click(); control.click(); expect(share).toHaveBeenCalledTimes(1); });
  const args = share.mock.calls[0] as unknown as [ShareData];
  expect(args[0].files?.[0]).toBeInstanceOf(File); expect(args[0].files?.[0]?.type).toBe('image/png');
  expect(args[0].text).toBe(document.querySelector<HTMLTextAreaElement>('textarea')!.value);
  expect(control.disabled).toBe(true); expect(renderer).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
  expect(control.disabled).toBe(false);
  expect(document.body.textContent).not.toContain('投稿しました');
});

it.each(['AbortError', 'NotAllowedError'])('handles %s without automatic download or opening X', async (name) => {
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockRejectedValue(new DOMException('blocked', name)) });
  const browserOpen = vi.spyOn(window, 'open');
  await mount(); await open(); await click(button('画像付きで共有'));
  expect(browserOpen).not.toHaveBeenCalled(); expect(button('画像付きで共有').disabled).toBe(false);
  expect(document.body.textContent).toContain(name === 'AbortError' ? '共有を中断しました' : '共有を開けませんでした');
});

it('closes by Escape/outside click, traps Tab, restores focus and body scroll, and revokes image URLs', async () => {
  document.body.style.overflow = 'auto';
  await mount(); const trigger = button('Xに記録を投稿'); trigger.focus(); await open();
  expect(document.activeElement).toBe(button('閉じる')); expect(document.body.style.overflow).toBe('hidden');
  await key('Tab', true); expect(document.activeElement?.textContent).toBe('2. Xの投稿画面を開く');
  await key('Tab'); expect(document.activeElement).toBe(button('閉じる'));
  await key('Escape'); expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger); expect(document.body.style.overflow).toBe('auto');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:record-preview');
  await open(); await click(document.querySelector<HTMLElement>('.record-share-backdrop')!);
  expect(document.activeElement).toBe(trigger);
});

it('keeps the preview snapshot consistent while open, and refreshes after closing and reopening', async () => {
  await mount(); await open(); await mount(1);
  expect(document.querySelector<HTMLTextAreaElement>('textarea')!.value).toContain('テスト4回');
  await click(button('閉じる')); await open();
  expect(document.querySelector<HTMLTextAreaElement>('textarea')!.value).toContain('テスト1回');
});

it('allows image-generation retry and does not expose unusable share controls', async () => {
  renderer.mockRejectedValueOnce(new Error('canvas unavailable'));
  await mount(); await open();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('画像を作成できません');
  expect(document.querySelector('.record-share-actions')).toBeNull();
  await click(button('もう一度作成')); expect(document.querySelector('.record-share-preview')).not.toBeNull();
});

it('discards late image work after close without leaking a URL', async () => {
  let resolve!: (value: { blob: Blob; fileName: string }) => void;
  renderer.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  await mount(); await open(); await click(button('閉じる'));
  await act(async () => resolve({ blob: new Blob(['png']), fileName: 'records.png' }));
  expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('falls back safely if canShare throws and encodes text without extra URL parameters', async () => {
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => { throw new Error('denied'); } });
  Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() });
  await mount(); await open(); expect(button('画像付きで共有')).toBeUndefined();
  const value = '記録 & #麻雀学習帳\n?url=https://example.com';
  const url = new URL(xRecordComposeUrl(value));
  expect(url.origin).toBe('https://twitter.com'); expect(url.pathname).toBe('/intent/tweet');
  expect([...url.searchParams.keys()]).toEqual(['text']); expect(url.searchParams.get('text')).toBe(value);
});


it.each(THEMES.map(({ id }) => id))('captures the applied %s theme ahead of an older saved preference', async (theme) => {
  localStorage.setItem('mahjong-study:theme', 'normal');
  document.documentElement.dataset.theme = theme;
  await mount(); await open();
  expect(renderer.mock.calls[0]?.[1]).toBe(theme);
  document.documentElement.dataset.theme = theme === 'cool' ? 'cute' : 'cool';
  await mount(9);
  expect(renderer).toHaveBeenCalledTimes(1);
  await click(button('閉じる')); await open();
  expect(renderer.mock.calls[1]?.[1]).toBe(document.documentElement.dataset.theme);
});

it.each([undefined, 'unknown'])('uses the saved valid theme when the applied theme is %s', async (theme) => {
  localStorage.setItem('mahjong-study:theme', 'moe');
  if (theme) document.documentElement.dataset.theme = theme;
  await mount(); await open();
  expect(renderer.mock.calls[0]?.[1]).toBe('moe');
});

it('uses the applied theme even if storage cannot be read', async () => {
  document.documentElement.dataset.theme = 'cute';
  const stored = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  await mount(); await open();
  expect(renderer.mock.calls[0]?.[1]).toBe('cute');
  expect(stored).not.toHaveBeenCalled();
  stored.mockRestore();
});

it.each(['false', 'throw'])('keeps image sharing when the combined payload returns %s', async (combined) => {
  const canShare = vi.fn((payload: ShareData) => {
    if (payload.text !== undefined) {
      if (combined === 'throw') throw new Error('combined unsupported');
      return false;
    }
    return Boolean(payload.files?.length);
  });
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: canShare });
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  const copied = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copied } });
  await mount(); await open();
  expect(button('画像付きで共有')).toBeUndefined();
  expect(document.body.textContent).toContain('この端末では画像だけを共有します');
  await click(button('画像を共有'));
  expect(share).toHaveBeenCalledTimes(1);
  expect(share.mock.calls[0]?.[0].files[0]).toBeInstanceOf(File);
  expect(share.mock.calls[0]?.[0]).not.toHaveProperty('text');
  expect(copied).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLDetailsElement>('details')?.open).toBe(false);
  expect(document.body.textContent).toContain('共有先で画像をご確認ください');
});

it('does not mistake text-only support for image support', async () => {
  const share = vi.fn();
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: (payload: ShareData) => Boolean(payload.text) });
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  await mount(); await open();
  expect(button('画像付きで共有')).toBeUndefined(); expect(button('画像を共有')).toBeUndefined();
  expect(document.querySelector<HTMLDetailsElement>('details')?.open).toBe(true);
  expect(share).not.toHaveBeenCalled();
});

it('copies only on the separate copy click and uses the exact displayed text', async () => {
  const copied = vi.fn().mockResolvedValue(undefined);
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copied } });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  await mount(); await open();
  expect(copied).not.toHaveBeenCalled();
  await click(button('投稿文をコピー'));
  expect(copied).toHaveBeenCalledWith(document.querySelector<HTMLTextAreaElement>('textarea')!.value);
  expect(document.body.textContent).toContain('投稿文をコピーしました');
  expect(share).not.toHaveBeenCalled();
  await click(button('画像付きで共有'));
  expect(copied).toHaveBeenCalledTimes(1);
});

it.each(['missing', 'rejected'])('selects the text for manual copy if clipboard is %s', async (mode) => {
  if (mode === 'rejected') Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
  await mount(); await open(); await click(button('投稿文をコピー'));
  const field = document.querySelector<HTMLTextAreaElement>('textarea')!;
  expect(document.activeElement).toBe(field);
  expect(field.selectionStart).toBe(0); expect(field.selectionEnd).toBe(field.value.length);
  expect(document.body.textContent).toContain('端末のコピー操作でコピーしてください');
  expect(document.body.textContent).not.toContain('投稿文をコピーしました');
});

it('traps focus at the summary while native-share fallback is collapsed and includes links after opening', async () => {
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  await mount(); await open();
  const details = document.querySelector<HTMLDetailsElement>('details')!;
  const summary = details.querySelector('summary')!;
  expect(details.open).toBe(false);
  await key('Tab', true); expect(document.activeElement).toBe(summary);
  await key('Tab'); expect(document.activeElement).toBe(button('閉じる'));
  await act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')); });
  await key('Tab', true); expect(document.activeElement?.textContent).toBe('2. Xの投稿画面を開く');
  await key('Tab'); expect(document.activeElement).toBe(button('閉じる'));
  await act(async () => { details.open = false; details.dispatchEvent(new Event('toggle')); });
  await key('Tab', true); expect(document.activeElement).toBe(summary);
});

it('can retry after cancellation and expands manual steps only for an error', async () => {
  const share = vi.fn().mockRejectedValueOnce(new DOMException('cancelled', 'AbortError')).mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError')).mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  await mount(); await open();
  await click(button('画像付きで共有'));
  expect(document.querySelector<HTMLDetailsElement>('details')?.open).toBe(false);
  await click(button('画像付きで共有'));
  expect(document.querySelector<HTMLDetailsElement>('details')?.open).toBe(true);
  await click(button('画像付きで共有'));
  expect(share).toHaveBeenCalledTimes(3);
  expect(document.body.textContent).toContain('共有先で画像と文面をご確認ください');
});

it('does not share before the PNG is ready', async () => {
  let resolve!: (value: { blob: Blob; fileName: string }) => void;
  renderer.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  await mount(); await open();
  expect(button('画像付きで共有')).toBeUndefined(); expect(button('画像を共有')).toBeUndefined();
  expect(document.querySelector('.record-share-actions')).toBeNull(); expect(share).not.toHaveBeenCalled();
  await act(async () => resolve({ blob: new Blob(['png']), fileName: 'records.png' }));
  expect(button('画像付きで共有')).toBeDefined(); expect(share).not.toHaveBeenCalled();
});

it('does not apply a late native-share result to a reopened dialog', async () => {
  let reject!: (value: Error) => void;
  const share = vi.fn(() => new Promise<void>((_done, failed) => { reject = failed; }));
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  await mount(); await open(); await click(button('画像付きで共有'));
  await click(button('閉じる')); await open();
  await act(async () => reject(new DOMException('blocked', 'NotAllowedError')));
  expect(document.querySelector<HTMLDetailsElement>('details')?.open).toBe(false);
  expect(document.querySelector('.record-share-status')?.textContent).toBe('');
  expect(button('画像付きで共有').disabled).toBe(false);
});
