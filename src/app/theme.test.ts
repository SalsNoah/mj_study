import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyTheme, loadTheme, saveTheme, THEMES, type ThemeId } from './theme';

let meta: HTMLMetaElement;
beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  meta = document.createElement('meta');
  meta.name = 'theme-color';
  document.head.append(meta);
});
afterEach(() => { meta.remove(); vi.restoreAllMocks(); delete document.documentElement.dataset.theme; });

const statusColors: Record<ThemeId, string> = {
  normal: '#1B4D3E', cool: '#0B1118', cute: '#FBE3EE', dopa: '#090B18', moe: '#FFF1F6',
};

it.each<ThemeId>(['normal', 'cool', 'cute', 'dopa', 'moe'])('preserves %s and keeps problem data separate', (theme) => {
  localStorage.setItem('mahjong-study:v1', '{"untouched":true}');
  saveTheme(theme);
  expect(loadTheme()).toBe(theme);
  expect(document.documentElement.dataset.theme).toBe(theme);
  expect(meta.content).toBe(statusColors[theme]);
  delete document.documentElement.dataset.theme;
  applyTheme(loadTheme());
  expect(document.documentElement.dataset.theme).toBe(theme);
  expect(localStorage.getItem('mahjong-study:v1')).toBe('{"untouched":true}');
});

it.each(['unknown', '', '__proto__', 'constructor', 'toString'])('does not activate unavailable theme %s', (theme) => {
  localStorage.setItem('mahjong-study:theme', theme);
  expect(loadTheme()).toBe('normal');
  expect(THEMES.map((item) => item.id)).not.toContain(theme);
});

it.each<ThemeId>(['dopa', 'moe'])('still applies %s when saving is unavailable', (theme) => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable'); });
  expect(() => saveTheme(theme)).not.toThrow();
  expect(document.documentElement.dataset.theme).toBe(theme);
  expect(meta.content).toBe(statusColors[theme]);
});

it('falls back safely if storage cannot be read', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage unavailable'); });
  expect(loadTheme()).toBe('normal');
});

it('uses the same known themes before and after the application loads', () => {
  const html = readFileSync('index.html', 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)![1]!;
  const bootstrap = new Function('document', 'localStorage', script);
  for (const theme of THEMES) {
    localStorage.setItem('mahjong-study:theme', theme.id);
    bootstrap(document, localStorage);
    const earlyColor = meta.content;
    expect(document.documentElement.dataset.theme).toBe(theme.id);
    applyTheme(loadTheme());
    expect(meta.content).toBe(earlyColor);
  }
  for (const unknown of ['unknown', '__proto__', 'constructor', 'toString']) {
    delete document.documentElement.dataset.theme;
    localStorage.setItem('mahjong-study:theme', unknown);
    bootstrap(document, localStorage);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    applyTheme(loadTheme());
    expect(document.documentElement.dataset.theme).toBe('normal');
    expect(meta.content).toBe(statusColors.normal);
  }
});
