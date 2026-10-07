import { uniqueMaterialStudyEvents } from '@/domain/materials';
import type { LearningMaterial, MaterialStudyEvent } from '@/domain/types';

export type MaterialSortKey = 'studyCount' | 'updatedAt' | 'lastStudiedAt';
export type MaterialSortDirection = 'asc' | 'desc';

/** Pure view ordering; equal values retain saved array order in both directions. */
export function sortMaterials(
  materials: readonly LearningMaterial[],
  events: readonly MaterialStudyEvent[] | undefined,
  key: MaterialSortKey,
  direction: MaterialSortDirection,
): LearningMaterial[] {
  const studies = new Map<string, { count: number; last: number | null }>();
  for (const event of uniqueMaterialStudyEvents(events)) {
    const summary = studies.get(event.materialId) ?? { count: 0, last: null };
    summary.count += 1;
    const at = Date.parse(event.at);
    if (Number.isFinite(at) && (summary.last === null || at > summary.last)) summary.last = at;
    studies.set(event.materialId, summary);
  }
  const value = (material: LearningMaterial): number | null => {
    if (key === 'studyCount') return studies.get(material.id)?.count ?? 0;
    if (key === 'lastStudiedAt') return studies.get(material.id)?.last ?? null;
    return Date.parse(material.updatedAt);
  };
  return materials.map((material, index) => ({ material, index, value: value(material) }))
    .sort((a, b) => {
      // No study date is not epoch zero: keep never-studied items last either way.
      if (a.value === null) return b.value === null ? a.index - b.index : 1;
      if (b.value === null) return -1;
      const difference = direction === 'asc' ? a.value - b.value : b.value - a.value;
      return difference || a.index - b.index;
    }).map(({ material }) => material);
}
