import { emptyStore, type LearningMaterial, type Store } from '../domain/types';

/** YouTube page titles verified 2026-10-07. Only used when the main storage key is absent. */
export function createInitialMaterials(): LearningMaterial[] {
  const timestamp = '2026-10-07T00:00:00.000Z';
  // Equal timestamps preserve this requested order in the existing stable updatedAt sort.
  return [
    ['apqIuvnVA9M', '〖麻雀講座〗上達に役立つ麻雀コンテンツ７選〖天鳳位〗'],
    ['8emBEqgAFzc', '〖麻雀講座〗5分でできる牌譜検討のやり方〖天鳳位〗'],
    ['2LjOtn6pgb8', '〖麻雀講座〗座学のし過ぎで打数少ない系天鳳位の座学講座〖ヨーテル〗'],
  ].map(([videoId, title]) => ({
    id: `initial-material-${videoId}`, title: title!, url: `https://youtu.be/${videoId}`,
    comment: '', createdAt: timestamp, updatedAt: timestamp,
  }));
}

/** Unlike an explicit empty/reset store, a never-saved study book includes starter links. */
export function createInitialStore(): Store {
  return { ...emptyStore(), materials: createInitialMaterials() };
}
