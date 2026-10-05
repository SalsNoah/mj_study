import { buildRecordSeries } from './recordSeries';
import type { DailyLog, MaterialStudyEvent } from './types';

export type RecordShareCounts = { tested: number; confirmed: number; materials: number };
export type RecordShareSnapshot = {
  day: string;
  createdAt: string;
  today: RecordShareCounts;
  total: RecordShareCounts;
};

/** A counts-only, detached snapshot of the same history used by the records chart. */
export function createRecordShareSnapshot(
  daily: Record<string, DailyLog> | undefined,
  events: readonly MaterialStudyEvent[] | undefined,
  now = new Date(),
): RecordShareSnapshot {
  const series = buildRecordSeries(daily, 'daily', now, events);
  const latest = series.points.at(-1)!;
  return {
    day: series.end,
    createdAt: now.toISOString(),
    today: { tested: latest.tested, confirmed: latest.confirmed, materials: latest.materials },
    total: { ...latest.cumulative },
  };
}

export function recordShareText(snapshot: RecordShareSnapshot): string {
  const counts = ({ tested, confirmed, materials }: RecordShareCounts) =>
    `テスト${tested.toLocaleString('ja-JP')}回・確認${confirmed.toLocaleString('ja-JP')}回・教材${materials.toLocaleString('ja-JP')}回`;
  return `${snapshot.day}の学習記録\n今日：${counts(snapshot.today)}\n累計：${counts(snapshot.total)}\n#麻雀学習帳`;
}
