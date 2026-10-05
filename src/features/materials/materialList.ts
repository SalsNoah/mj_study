import { normalizeMaterialUrl } from '@/domain/materials';
import type { LearningMaterial } from '@/domain/types';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const EMBED_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);

/** Thumbnail requests contain only a validated video ID, never the saved URL's query or fragment. */
export function youtubeThumbnailUrl(input: string): string | null {
  const normalized = normalizeMaterialUrl(input);
  if (!normalized.ok) return null;
  const url = new URL(normalized.url);
  if (url.port) return null;
  const path = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
    if (path.length === 1) id = path[0]!;
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) id = url.searchParams.get('v');
    else if (path.length === 2 && ['shorts', 'live', 'embed'].includes(path[0]!)) id = path[1]!;
  } else if (EMBED_HOSTS.has(url.hostname) && path.length === 2 && path[0] === 'embed') {
    id = path[1]!;
  }
  // Conservative recognition: unsupported/future URL shapes keep a local placeholder.
  return id && VIDEO_ID.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
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
