import { LIMITS, type Tag } from './types';

/** 前後空白除去・NFKC・英字大小同一視の正規化キー */
export function normalizeTagKey(name: string): string {
  return name.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

export function normalizeTagDisplay(name: string): string {
  return name.normalize('NFKC').trim();
}

export type TagValidation =
  | { ok: true; name: string; key: string }
  | { ok: false; reason: string };

export function validateTagName(
  name: string,
  existing: readonly Tag[],
  excludeId?: string,
): TagValidation {
  const display = normalizeTagDisplay(name);
  if (!display) return { ok: false, reason: 'タグ名が空です' };
  if (display.length > LIMITS.tagName) {
    return { ok: false, reason: `タグ名は${LIMITS.tagName}文字以内です` };
  }
  const key = normalizeTagKey(display);
  const dup = existing.find(
    (t) => t.id !== excludeId && normalizeTagKey(t.name) === key,
  );
  if (dup) return { ok: false, reason: '同名のタグが既にあります' };
  return { ok: true, name: display, key };
}

export function canAddTag(
  existingCount: number,
  problemTagCount: number,
): TagValidation | { ok: true } {
  if (existingCount >= LIMITS.tagsTotal) {
    return { ok: false, reason: `タグは全体で${LIMITS.tagsTotal}個までです` };
  }
  if (problemTagCount >= LIMITS.tagsPerProblem) {
    return { ok: false, reason: `1問あたりタグは${LIMITS.tagsPerProblem}個までです` };
  }
  return { ok: true };
}
