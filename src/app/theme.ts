export type ThemeId = 'normal' | 'cool' | 'cute';

export const THEMES: Array<{ id: ThemeId; name: string; desc: string }> = [
  { id: 'normal', name: 'ノーマル', desc: '定番の緑' },
  { id: 'cool', name: 'クール', desc: 'ダーク' },
  { id: 'cute', name: 'キュート', desc: 'パステル' },
];

/** 見た目は端末ごとの好みなので、問題データ（バックアップ対象）とは別のキーに置く。index.html の起動スクリプトも同じキーを読む */
const KEY = 'mahjong-study:theme';

const STATUS_BAR: Record<ThemeId, string> = {
  normal: '#1B4D3E',
  cool: '#0B1118',
  cute: '#FBE3EE',
};

function isTheme(v: unknown): v is ThemeId {
  return v === 'normal' || v === 'cool' || v === 'cute';
}

export function loadTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : 'normal';
  } catch {
    return 'normal';
  }
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', STATUS_BAR[theme]);
  if (theme === 'cute') void import('./cuteFont');
}

export function saveTheme(theme: ThemeId) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // 保存できなくても今回の表示には反映する
  }
  applyTheme(theme);
}
