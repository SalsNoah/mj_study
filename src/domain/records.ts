import type { Attempt, DailyLog, Store, StudyState, TileCode } from './types';

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayKeyFromIso(iso: string): string {
  return dayKey(new Date(iso));
}

export function bumpDaily(
  daily: Record<string, DailyLog> | undefined,
  key: string,
  field: keyof DailyLog,
  delta: number,
): Record<string, DailyLog> {
  const next = { ...(daily ?? {}) };
  const cur = next[key] ?? { tested: 0, confirmed: 0 };
  next[key] = { ...cur, [field]: Math.max(0, cur[field] + delta) };
  return next;
}

export type DailyTotals = { tested: number; confirmed: number; total: number };

export function dailyTotals(daily: Record<string, DailyLog> | undefined): DailyTotals {
  let tested = 0;
  let confirmed = 0;
  for (const log of Object.values(daily ?? {})) {
    tested += log.tested;
    confirmed += log.confirmed;
  }
  return { tested, confirmed, total: tested + confirmed };
}

/** 今日（または昨日）から遡って、学習した日が続いている日数 */
export function studyStreak(daily: Record<string, DailyLog> | undefined, today: Date = new Date()): number {
  const active = (d: Date) => {
    const log = daily?.[dayKey(d)];
    return !!log && log.tested + log.confirmed > 0;
  };
  const cursor = new Date(today);
  if (!active(cursor)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (active(cursor)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 古いデータに無い項目（日別記録・最終回答日・最終正解日）を回答履歴から補う */
export function normalizeStore(store: Store): Store {
  let daily = store.daily;
  if (!daily) {
    daily = {};
    for (const a of store.attempts) {
      const key = dayKeyFromIso(a.at);
      const cur = daily[key] ?? { tested: 0, confirmed: 0 };
      daily[key] = { ...cur, tested: cur.tested + 1 };
    }
  }

  const needsDates = store.study.some(
    (s) => s.lastSolvedAt === undefined || s.lastCorrectAt === undefined,
  );
  let study: StudyState[] = store.study;
  if (needsDates) {
    const lastSolved = new Map<string, string>();
    const lastCorrect = new Map<string, string>();
    for (const a of store.attempts) {
      if ((lastSolved.get(a.problemId) ?? '') < a.at) lastSolved.set(a.problemId, a.at);
      if (a.result === 'correct' && (lastCorrect.get(a.problemId) ?? '') < a.at) {
        lastCorrect.set(a.problemId, a.at);
      }
    }
    study = store.study.map((s) => ({
      ...s,
      lastSolvedAt: s.lastSolvedAt === undefined ? lastSolved.get(s.problemId) ?? null : s.lastSolvedAt,
      lastCorrectAt:
        s.lastCorrectAt === undefined ? lastCorrect.get(s.problemId) ?? null : s.lastCorrectAt,
    }));
  }

  if (daily === store.daily && study === store.study) return store;
  return { ...store, daily, study };
}

export function applyAttemptToStudy(study: StudyState, attempt: Attempt): StudyState {
  return {
    ...study,
    lastReviewedAt: attempt.at,
    lastSolvedAt: attempt.at,
    lastCorrectAt: attempt.result === 'correct' ? attempt.at : study.lastCorrectAt ?? null,
  };
}

export type Badge = {
  id: string;
  name: string;
  need: number;
  tile: TileCode;
};

/** 累計学習量（テストで解いた数＋確認した数）で進化する称号 */
export const BADGES: Badge[] = [
  { id: 'novice', name: '雀士見習い', need: 0, tile: '1s' },
  { id: 'beginner', name: '初心者', need: 10, tile: '1p' },
  { id: 'elementary', name: '初級者', need: 30, tile: '1m' },
  { id: 'intermediate', name: '中級者', need: 60, tile: '5p' },
  { id: 'advanced', name: '上級者', need: 100, tile: '0p' },
  { id: 'dan1', name: '初段', need: 200, tile: '1z' },
  { id: 'dan2', name: '二段', need: 350, tile: '2z' },
  { id: 'dan3', name: '三段', need: 500, tile: '3z' },
  { id: 'dan4', name: '四段', need: 800, tile: '4z' },
  { id: 'gou', name: '雀豪', need: 1200, tile: '5z' },
  { id: 'sei', name: '雀聖', need: 2000, tile: '6z' },
  { id: 'shin', name: '雀神', need: 3000, tile: '7z' },
];

export type BadgeStatus = {
  current: Badge;
  next: Badge | null;
  /** 次の称号までの進捗 0〜1 */
  progress: number;
  remaining: number;
};

export function badgeStatus(total: number): BadgeStatus {
  let idx = 0;
  for (let i = 0; i < BADGES.length; i++) {
    if (total >= BADGES[i]!.need) idx = i;
  }
  const current = BADGES[idx]!;
  const next = BADGES[idx + 1] ?? null;
  if (!next) return { current, next: null, progress: 1, remaining: 0 };
  const span = next.need - current.need;
  return {
    current,
    next,
    progress: Math.min(1, (total - current.need) / span),
    remaining: next.need - total,
  };
}

export function formatShortDate(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}/${md}`;
}
