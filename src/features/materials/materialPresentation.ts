import type { LearningMaterial, MaterialStudyEvent } from '@/domain/types';
import { normalizeMaterialUrl, uniqueMaterialStudyEvents } from '@/domain/materials';

export function materialHost(url: string): string {
  const normalized = normalizeMaterialUrl(url);
  return normalized.ok ? new URL(normalized.url).hostname.replace(/^www\./, '') : 'URLを確認してください';
}

export function materialFingerprint(material: LearningMaterial): string {
  return JSON.stringify([material.id, material.title, material.url, material.comment, material.createdAt, material.updatedAt]);
}

export function materialHistory(events: readonly MaterialStudyEvent[] | undefined, materialId: string): MaterialStudyEvent[] {
  return uniqueMaterialStudyEvents(events).filter((event) => event.materialId === materialId)
    .reverse().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function materialDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
