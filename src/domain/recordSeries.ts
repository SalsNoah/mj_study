import { uniqueMaterialStudyEvents } from './materials';
import { dayKey } from './records';
import type { DailyLog, MaterialStudyEvent } from './types';

export type RecordPeriod = 'daily' | 'weekly' | 'monthly';

export const RECORD_PERIODS: ReadonlyArray<{ value: RecordPeriod; label: string; count: number; range: string }> = [
  { value: 'daily', label: '日別', count: 14, range: '直近14日' },
  { value: 'weekly', label: '週別', count: 12, range: '今週を含む12週' },
  { value: 'monthly', label: '月別', count: 12, range: '今月を含む12か月' },
];

export type RecordPoint = DailyLog & {
  materials: number;
  key: string;
  start: string;
  end: string;
  label: string;
  axisLabel: string;
};

export type RecordSeries = {
  period: RecordPeriod;
  start: string;
  end: string;
  points: RecordPoint[];
};

const DAY = 86_400_000;

// UTC values here represent calendar dates, not instants. Local clock changes
// must not shorten, duplicate or skip a study day at a DST boundary.
function calendarDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date;
}

function calendarKey(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parseDay(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = calendarDate(year!, month! - 1, day!);
  return calendarKey(date) === key ? date : null;
}

function periodStart(date: Date, period: RecordPeriod): Date {
  const start = new Date(date);
  if (period === 'weekly') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  if (period === 'monthly') start.setUTCDate(1);
  return start;
}

function movePeriod(date: Date, period: RecordPeriod, amount: number): Date {
  const moved = new Date(date);
  if (period === 'monthly') moved.setUTCMonth(moved.getUTCMonth() + amount, 1);
  else moved.setUTCDate(moved.getUTCDate() + amount * (period === 'weekly' ? 7 : 1));
  return moved;
}

export function recordDateLabel(key: string, withYear = true): string {
  const [year, month, day] = key.split('-').map(Number);
  return `${withYear ? `${year}/` : ''}${month}/${day}`;
}

/** Calendar-aligned counts through today; missing dates contribute zero. */
export function buildRecordSeries(
  daily: Record<string, DailyLog> | undefined,
  period: RecordPeriod,
  today = new Date(),
  materialStudyEvents?: readonly MaterialStudyEvent[],
): RecordSeries {
  if (!Number.isFinite(today.getTime())) throw new RangeError('Invalid current date');
  const end = calendarDate(today.getFullYear(), today.getMonth(), today.getDate());
  const count = RECORD_PERIODS.find((option) => option.value === period)!.count;
  const first = movePeriod(periodStart(end, period), period, 1 - count);
  const points: RecordPoint[] = Array.from({ length: count }, (_, index) => {
    const startDate = movePeriod(first, period, index);
    const endDate = new Date(Math.min(movePeriod(startDate, period, 1).getTime() - DAY, end.getTime()));
    const startKey = calendarKey(startDate);
    const endKey = calendarKey(endDate);
    const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
    const label = period === 'daily' ? recordDateLabel(startKey)
      : period === 'monthly' ? `${startDate.getUTCFullYear()}年${startDate.getUTCMonth() + 1}月${index === count - 1 ? `（${endDate.getUTCDate()}日まで）` : ''}`
        : `${recordDateLabel(startKey)}〜${recordDateLabel(endKey, !sameYear)}`;
    return {
      key: startKey, start: startKey, end: endKey, label,
      axisLabel: period === 'monthly' ? `${startDate.getUTCFullYear()}/${startDate.getUTCMonth() + 1}` : recordDateLabel(startKey, false),
      tested: 0, confirmed: 0, materials: 0,
    };
  });
  const byStart = new Map(points.map((point) => [point.key, point]));
  for (const [key, log] of Object.entries(daily ?? {})) {
    const date = parseDay(key);
    if (!date || date < first || date > end) continue;
    const point = byStart.get(calendarKey(periodStart(date, period)));
    if (point) {
      point.tested += log.tested;
      point.confirmed += log.confirmed;
    }
  }
  for (const event of uniqueMaterialStudyEvents(materialStudyEvents)) {
    const instant = new Date(event.at);
    if (!Number.isFinite(instant.getTime())) continue;
    const date = parseDay(dayKey(instant));
    if (!date || date < first || date > end) continue;
    const point = byStart.get(calendarKey(periodStart(date, period)));
    if (point) point.materials += 1;
  }
  return { period, start: calendarKey(first), end: calendarKey(end), points };
}
