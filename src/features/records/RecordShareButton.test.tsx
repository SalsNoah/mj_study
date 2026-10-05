import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RecordShareButton, xRecordComposeUrl } from './RecordShareButton';
import { renderRecordShareImage } from './renderRecordShare';

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
  expect(button('画像と文面を共有')).toBeUndefined();
  expect(storage).not.toHaveBeenCalled(); expect(browserOpen).not.toHaveBeenCalled();
});

it('shares the prepared PNG and exact preview text directly in the click, guarding double clicks', async () => {
  let resolve!: () => void;
  const share = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  await mount(); await open();
  const control = button('画像と文面を共有');
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
  await mount(); await open(); await click(button('画像と文面を共有'));
  expect(browserOpen).not.toHaveBeenCalled(); expect(button('画像と文面を共有').disabled).toBe(false);
  expect(document.body.textContent).toContain(name === 'AbortError' ? '共有をキャンセルしました' : '共有を開けませんでした');
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
  await mount(); await open(); expect(button('画像と文面を共有')).toBeUndefined();
  const value = '記録 & #麻雀学習帳\n?url=https://example.com';
  const url = new URL(xRecordComposeUrl(value));
  expect(url.origin).toBe('https://twitter.com'); expect(url.pathname).toBe('/intent/tweet');
  expect([...url.searchParams.keys()]).toEqual(['text']); expect(url.searchParams.get('text')).toBe(value);
});
