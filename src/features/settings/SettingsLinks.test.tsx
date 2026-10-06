import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '@/app/store';
import { emptyStore, STORAGE_KEY } from '@/domain/types';
import { SettingsPage } from './SettingsPage';

let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyStore()));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<AppProvider><MemoryRouter><SettingsPage /></MemoryRouter></AppProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('offers the requested creator link as an accessible, safe new-tab action in either settings view', async () => {
  const before = localStorage.getItem(STORAGE_KEY);
  const link = host.querySelector<HTMLAnchorElement>('a[href="https://x.com/Sals_mj"]')!;
  expect(link.textContent?.trim()).toBe('製作者のX');
  expect(link.target).toBe('_blank');
  expect(link.relList.contains('noopener')).toBe(true);
  expect(link.relList.contains('noreferrer')).toBe(true);
  expect(link.getAttribute('aria-label')).toBe('製作者のX（新しいタブで開く）');
  expect(link.tabIndex).toBe(0);
  expect(link.closest('[hidden]')).toBeNull();
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(tab => tab.textContent === 'データ管理')!.click());
  expect(link.closest('[hidden]')).toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});
