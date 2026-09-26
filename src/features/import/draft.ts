import type { Meld, ProblemContext, TileCode } from '@/domain/types';

/** スクショから読み取った内容を作成画面へ渡すための一時置き場 */
export type ImportDraft = {
  concealed: TileCode[];
  melds: Meld[];
  doraIndicators: TileCode[];
  context: ProblemContext;
};

const KEY = 'mahjong-study:import-draft';

export function putImportDraft(draft: ImportDraft): void {
  sessionStorage.setItem(KEY, JSON.stringify(draft));
}

export function peekImportDraft(): ImportDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ImportDraft) : null;
  } catch {
    return null;
  }
}

export function clearImportDraft(): void {
  sessionStorage.removeItem(KEY);
}
