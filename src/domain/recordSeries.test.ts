import { describe, expect, it } from 'vitest';
import { buildRecordSeries, RECORD_PERIODS, type RecordPeriod } from './recordSeries';
import type { DailyLog } from './types';

const log = (tested: number, confirmed = 0): DailyLog => ({ tested, confirmed });
const totals = (daily: Record<string, DailyLog>, period: RecordPeriod, now: Date) => {
  const { points } = buildRecordSeries(daily, period, now);
  return points.reduce((sum, point) => ({ tested: sum.tested + point.tested, confirmed: sum.confirmed + point.confirmed }), log(0));
};

describe('calendar-aligned record series', () => {
  it.each(RECORD_PERIODS)('fills empty $value histories with zeroes in ascending order', ({ value, count }) => {
    const series = buildRecordSeries(undefined, value, new Date(2026, 9, 5));
    expect(series.points).toHaveLength(count);
    expect(series.points.map((point) => point.key)).toEqual(series.points.map((point) => point.key).sort());
    expect(series.points.every((point) => point.tested === 0 && point.confirmed === 0)).toBe(true);
    expect(series.start).toBe(series.points[0]!.start);
    expect(series.end).toBe('2026-10-05');
    expect(series.points.at(-1)!.end).toBe(series.end);
  });

  it('keeps a single active date and fills both surrounding gaps', () => {
    const series = buildRecordSeries({ '2026-09-30': log(7, 2) }, 'daily', new Date(2026, 9, 5));
    expect(series.start).toBe('2026-09-22');
    expect(series.points.filter((point) => point.tested + point.confirmed > 0)).toEqual([
      expect.objectContaining({ key: '2026-09-30', tested: 7, confirmed: 2 }),
    ]);
    expect(series.points[0]).toMatchObject(log(0));
    expect(series.points.at(-1)).toMatchObject(log(0));
  });

  it('includes leap day without rolling it into March', () => {
    const series = buildRecordSeries({ '2024-02-28': log(2), '2024-02-29': log(3, 4), '2024-03-01': log(1) }, 'daily', new Date(2024, 2, 1));
    expect(series.points.slice(-3).map(({ key, tested, confirmed }) => ({ key, tested, confirmed }))).toEqual([
      { key: '2024-02-28', tested: 2, confirmed: 0 },
      { key: '2024-02-29', tested: 3, confirmed: 4 },
      { key: '2024-03-01', tested: 1, confirmed: 0 },
    ]);
  });

  it('uses Monday weeks across years and excludes dates after today', () => {
    const daily = { '2024-12-29': log(2), '2024-12-30': log(3), '2024-12-31': log(4, 2), '2025-01-01': log(5, 1), '2025-01-02': log(99), '2025-01-06': log(99) };
    const series = buildRecordSeries(daily, 'weekly', new Date(2025, 0, 1));
    expect(series.start).toBe('2024-10-14');
    expect(series.points.at(-2)).toMatchObject({ start: '2024-12-23', end: '2024-12-29', tested: 2, confirmed: 0 });
    expect(series.points.at(-1)).toMatchObject({ start: '2024-12-30', end: '2025-01-01', label: '2024/12/30〜2025/1/1', tested: 12, confirmed: 3 });
  });

  it('starts a new bucket exactly on Monday and the first of a month', () => {
    const daily = { '2026-08-30': log(2), '2026-08-31': log(3), '2026-09-01': log(5) };
    const monday = buildRecordSeries(daily, 'weekly', new Date(2026, 7, 31));
    expect(monday.points.at(-1)).toMatchObject({ start: '2026-08-31', end: '2026-08-31', tested: 3 });
    expect(monday.points.at(-2)).toMatchObject({ end: '2026-08-30', tested: 2 });
    const month = buildRecordSeries(daily, 'monthly', new Date(2026, 8, 1));
    expect(month.points.at(-2)).toMatchObject({ start: '2026-08-01', end: '2026-08-31', tested: 5 });
    expect(month.points.at(-1)).toMatchObject({ start: '2026-09-01', end: '2026-09-01', tested: 5 });
  });

  it('sums calendar months, including leap February and December to January', () => {
    const daily = { '2024-02-01': log(1, 2), '2024-02-29': log(2, 3), '2024-12-31': log(4), '2025-01-01': log(5), '2025-01-31': log(99) };
    const series = buildRecordSeries(daily, 'monthly', new Date(2025, 0, 2));
    expect(series.start).toBe('2024-02-01');
    expect(series.points[0]).toMatchObject({ start: '2024-02-01', end: '2024-02-29', tested: 3, confirmed: 5 });
    expect(series.points.at(-2)).toMatchObject({ axisLabel: '2024/12', tested: 4 });
    expect(series.points.at(-1)).toMatchObject({ start: '2025-01-01', end: '2025-01-02', axisLabel: '2025/1', tested: 5 });
  });

  it.each([
    { now: new Date(2024, 2, 12, 0, 30), dates: ['2024-03-09', '2024-03-10', '2024-03-11', '2024-03-12'] },
    { now: new Date(2024, 10, 5, 0, 30), dates: ['2024-11-02', '2024-11-03', '2024-11-04', '2024-11-05'] },
  ])('does not skip or duplicate local dates around DST: $dates', ({ now, dates }) => {
    const daily = Object.fromEntries(dates.map((date, index) => [date, log(index + 1)]));
    const series = buildRecordSeries(daily, 'daily', now);
    expect(series.points.slice(-4).map((point) => point.key)).toEqual(dates);
    expect(new Set(series.points.map((point) => point.key)).size).toBe(14);
    expect(totals(daily, 'daily', now)).toEqual(log(10));
    expect(totals(daily, 'weekly', now)).toEqual(log(10));
    expect(totals(daily, 'monthly', now)).toEqual(log(10));
  });

  it('limits a long history to the displayed interval without changing saved counts', () => {
    const daily: Record<string, DailyLog> = { '2000-01-01': log(5000) };
    for (let year = 2022; year <= 2026; year++) {
      for (let month = 1; month <= 12; month++) daily[`${year}-${String(month).padStart(2, '0')}-01`] = log(1, 2);
    }
    const before = JSON.stringify(daily);
    const now = new Date(2026, 9, 5);
    expect(totals(daily, 'daily', now)).toEqual(log(1, 2));
    expect(totals(daily, 'weekly', now)).toEqual(log(3, 6));
    expect(totals(daily, 'monthly', now)).toEqual(log(12, 24));
    expect(JSON.stringify(daily)).toBe(before);
  });

  it('includes the oldest visible day but not an earlier day', () => {
    const daily = { '2026-09-21': log(99), '2026-09-22': log(3), '2026-10-05': log(4), '2026-10-06': log(99) };
    expect(totals(daily, 'daily', new Date(2026, 9, 5))).toEqual(log(7));
  });

  it('ignores malformed and impossible dates instead of normalizing them into a bucket', () => {
    const daily = { '2025-02-29': log(99), '2025-02-30': log(99), '2025-00-10': log(99), '2025-13-01': log(99), '2025-03-00': log(99), '2025-3-1': log(99), 'not-a-date': log(99), '2025-03-01T00:00:00Z': log(99), '2025-03-01': log(4, 2) };
    for (const { value } of RECORD_PERIODS) expect(totals(daily, value, new Date(2025, 2, 2))).toEqual(log(4, 2));
    expect(() => buildRecordSeries(daily, 'daily', new Date('invalid'))).toThrow(RangeError);
  });
});
