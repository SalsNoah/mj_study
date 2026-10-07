import { youtubeVideoId } from './youtube';
import type { LearningMaterial } from '@/domain/types';

export function youtubeThumbnailUrl(input: string): string | null {
  const id = youtubeVideoId(input);
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
}

function searchText(value: string): string { return value.normalize('NFKC').toLocaleLowerCase('ja-JP'); }

export function filterMaterials(materials: readonly LearningMaterial[], query: string): readonly LearningMaterial[] {
  const terms = searchText(query).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return materials;
  return materials.filter((material) => {
    let decodedUrl = material.url;
    try { decodedUrl = decodeURIComponent(material.url); } catch { /* Preserve the original URL for literal matching. */ }
    const text = searchText(`${material.title}\n${material.url}\n${decodedUrl}`);
    return terms.every((term) => text.includes(term));
  });
}
