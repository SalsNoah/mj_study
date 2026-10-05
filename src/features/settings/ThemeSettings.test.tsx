import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { emptyStore, STORAGE_KEY } from '@/domain/types';
import { SettingsPage } from './SettingsPage';

let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyStore()));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<AppProvider><MemoryRouter><SettingsPage /></MemoryRouter></AppProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete document.documentElement.dataset.theme; vi.unstubAllGlobals(); });

it('allows DOPA, keeps 萌え disabled, and never edits saved learning data', async () => {
  const before = localStorage.getItem(STORAGE_KEY);
  const options = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  expect(options).toHaveLength(5);
  const dopa = options.find((option) => option.textContent!.includes('DOPA'))!;
  const moe = options.find((option) => option.textContent!.includes('萌え'))!;
  expect(moe.disabled).toBe(true);
  expect(moe.textContent).toContain('後日実装');
  await act(async () => dopa.click());
  expect(dopa.getAttribute('aria-checked')).toBe('true');
  expect(localStorage.getItem('mahjong-study:theme')).toBe('dopa');
  await act(async () => moe.click());
  expect(localStorage.getItem('mahjong-study:theme')).toBe('dopa');
  expect(moe.getAttribute('aria-checked')).toBe('false');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});

it('uses a single tab stop and arrow keys skip the unavailable theme', async () => {
  const normal = host.querySelector<HTMLButtonElement>('[data-theme-choice="normal"]')!;
  const dopa = host.querySelector<HTMLButtonElement>('[data-theme-choice="dopa"]')!;
  expect(host.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(1);
  normal.focus();
  await act(async () => normal.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
  expect(document.activeElement).toBe(dopa);
  expect(dopa.getAttribute('aria-checked')).toBe('true');
  await act(async () => dopa.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(document.activeElement).toBe(normal);
  expect(normal.getAttribute('aria-checked')).toBe('true');
  expect(host.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(1);
});
