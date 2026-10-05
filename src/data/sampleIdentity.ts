import { normalizeTagKey } from '@/domain/tags';
import type { Problem, Tag } from '@/domain/types';

export const SAMPLE_CATALOG_ID = 'mahjong-study-samples';
export const SAMPLE_CATALOG_VERSION = '2026-10-05.3';
export const SAMPLE_TAG_NAME = 'サンプル';

/** Canonical JSON is deliberately lossless: no hash collision can authorize removal. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
}

/** IDs and timestamps are identity, not editable content. Tag names survive import remapping. */
export function contentFingerprint(problem: Problem, tags: Tag[], tagNames?: string[]): string {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, sample: _sample, tagIds, ...content } = problem;
  const resolved = tagNames ?? tagIds.map((id) => {
    const matches = tags.filter((tag) => tag.id === id);
    // Missing or ambiguous references must never match a shipped sample.
    return matches.length === 1 ? matches[0]!.name : `\u0000unresolved:${id}`;
  });
  return canonicalJson({
    ...content,
    melds: content.melds.map(({ id: _meldId, ...meld }) => meld),
    attachments: content.attachments.map(({ id: _attachmentId, ...attachment }) => attachment),
    tags: [...new Set(resolved.map(normalizeTagKey))].sort(),
  });
}
