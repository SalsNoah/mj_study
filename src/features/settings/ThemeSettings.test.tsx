import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { emptyStore, STORAGE_KEY } from '@/domain/types';
import { applyTheme, loadTheme, type ThemeId } from '@/app/theme';
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
  await mount();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete document.documentElement.dataset.theme; vi.unstubAllGlobals(); });

async function mount() {
  await act(async () => root.render(<AppProvider><MemoryRouter><SettingsPage /></MemoryRouter></AppProvider>));
}
function option(theme: ThemeId) {
  return host.querySelector<HTMLButtonElement>(`[data-theme-choice="${theme}"]`)!;
}

it('allows all five themes, including 萌え, without editing saved learning data', async () => {
  const before = localStorage.getItem(STORAGE_KEY);
  const options = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  expect(options).toHaveLength(5);
  expect(option('moe').textContent).toContain('萌え');
  expect(host.textContent).not.toContain('後日実装');
  for (const theme of ['moe', 'normal', 'cool', 'cute', 'dopa'] as const) {
    expect(option(theme).disabled).toBe(false);
    await act(async () => option(theme).click());
    expect(localStorage.getItem('mahjong-study:theme')).toBe(theme);
    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(option(theme).getAttribute('aria-checked')).toBe('true');
    expect(host.querySelectorAll('[role="radio"][aria-checked="true"]')).toHaveLength(1);
    expect(host.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  }
});

it('includes 萌え in arrow-key wrapping, Home and End with a single tab stop', async () => {
  expect(host.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(1);
  option('normal').focus();
  const steps: Array<[string, ThemeId]> = [
    ['End', 'moe'], ['ArrowRight', 'normal'], ['ArrowLeft', 'moe'],
    ['ArrowUp', 'dopa'], ['ArrowDown', 'moe'], ['Home', 'normal'], ['ArrowDown', 'cool'],
  ];
  for (const [key, theme] of steps) {
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    expect(document.activeElement).toBe(option(theme));
    expect(option(theme).getAttribute('aria-checked')).toBe('true');
    expect(option(theme).tabIndex).toBe(0);
    expect(localStorage.getItem('mahjong-study:theme')).toBe(theme);
    expect(host.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(1);
  }
});

it('restores 萌え on a fresh mount and can switch back to another theme', async () => {
  await act(async () => option('moe').click());
  await act(async () => root.render(null));
  delete document.documentElement.dataset.theme;
  applyTheme(loadTheme());
  await mount();
  expect(document.documentElement.dataset.theme).toBe('moe');
  expect(option('moe').getAttribute('aria-checked')).toBe('true');
  expect(option('moe').tabIndex).toBe(0);
  await act(async () => option('cute').click());
  expect(option('moe').getAttribute('aria-checked')).toBe('false');
  expect(document.documentElement.dataset.theme).toBe('cute');
});

it('keeps an unknown saved ID on the normal option when settings mount', async () => {
  await act(async () => root.render(null));
  localStorage.setItem('mahjong-study:theme', 'future-theme');
  applyTheme(loadTheme());
  await mount();
  expect(document.documentElement.dataset.theme).toBe('normal');
  expect(option('normal').getAttribute('aria-checked')).toBe('true');
  expect(option('normal').tabIndex).toBe(0);
  expect(host.querySelectorAll('[role="radio"][aria-checked="true"]')).toHaveLength(1);
});
