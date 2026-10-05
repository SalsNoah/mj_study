import { uniqueMaterialStudyEvents } from './materials';
import type { Badge, BadgeStatus } from './records';
import type { MaterialStudyEvent } from './types';

/** 教材の手動学習記録だけで進む称号。問題学習の称号とは別に算出する。 */
export const MATERIAL_BADGES: readonly Badge[] = [
  { id: 'material-ready', name: '学びの準備', need: 0, level: 0 },
  { id: 'material-first', name: '学びの一歩', need: 1, level: 1 },
  { id: 'material-stack', name: '学びの積み重ね', need: 5, level: 2 },
  { id: 'material-habit', name: '学びの習慣', need: 10, level: 3 },
  { id: 'material-explorer', name: '学びの探究者', need: 30, level: 4 },
  { id: 'material-keeper', name: '学びの継続者', need: 100, level: 5 },
];

export function materialBadgeStatus(total: number): BadgeStatus {
  const count = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  let index = 0;
  for (let i = 0; i < MATERIAL_BADGES.length; i++) {
    if (count >= MATERIAL_BADGES[i]!.need) index = i;
  }
  const current = MATERIAL_BADGES[index]!;
  const next = MATERIAL_BADGES[index + 1] ?? null;
  if (!next) return { current, next: null, progress: 1, remaining: 0 };
  return {
    current,
    next,
    progress: (count - current.need) / (next.need - current.need),
    remaining: next.need - count,
  };
}

export function recentMaterialStudyEvents(events: readonly MaterialStudyEvent[] | undefined): MaterialStudyEvent[] {
  return uniqueMaterialStudyEvents(events).reverse().sort((a, b) => {
    const time = (event: MaterialStudyEvent) => Number.isFinite(Date.parse(event.at)) ? Date.parse(event.at) : 0;
    return time(b) - time(a);
  });
}
