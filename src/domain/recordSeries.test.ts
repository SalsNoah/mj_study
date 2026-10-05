import { describe, expect, it } from 'vitest';
import { buildRecordSeries, RECORD_PERIODS, type RecordPeriod } from './recordSeries';
import { countMaterialStudies, validateMaterialData } from './materials';
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

describe('material study calendar series', () => {
  const event = (id: string, date: Date | string) => ({
    id, materialId: 'material', at: typeof date === 'string' ? date : date.toISOString(),
    title: '学習時の教材名', url: 'https://example.com/lesson', comment: '学習時のコメント',
  });

  it.each(RECORD_PERIODS)('keeps zero/one/many and duplicate events independent of problem counts in $value', ({ value }) => {
    const today = new Date(2026, 9, 5, 12);
    const events = Array.from({ length: 5 }, (_, index) => event(String(index), today));
    for (const history of [undefined, [events[0]!], [...events, events[0]!]]) {
      const series = buildRecordSeries({ '2026-10-05': log(2, 3) }, value, today, history);
      expect(series.points.at(-1)).toMatchObject({ tested: 2, confirmed: 3, materials: history ? history.length === 1 ? 1 : 5 : 0 });
      expect(series.points.slice(0, -1).every(({ materials }) => materials === 0)).toBe(true);
    }
  });

  it('uses event local dates, includes boundary days and excludes future and out-of-range dates', () => {
    const events = [
      event('before', new Date(2026, 8, 21, 23, 59)), event('first', new Date(2026, 8, 22)),
      event('today', new Date(2026, 9, 5, 23, 59)), event('after', new Date(2026, 9, 6)),
      event('invalid', 'invalid'),
    ];
    const series = buildRecordSeries(undefined, 'daily', new Date(2026, 9, 5), events);
    expect(series.points[0]).toMatchObject({ key: '2026-09-22', materials: 1 });
    expect(series.points.at(-1)).toMatchObject({ key: '2026-10-05', materials: 1 });
    expect(series.points.reduce((sum, { materials }) => sum + materials, 0)).toBe(2);
  });

  it('uses Monday weeks and calendar months across year and leap-day boundaries', () => {
    const events = [
      event('leap', new Date(2024, 1, 29, 23, 59)), event('march', new Date(2024, 2, 1)),
      event('sunday', new Date(2024, 11, 29, 23, 59)), event('monday', new Date(2024, 11, 30)),
      event('newyear', new Date(2025, 0, 1)), event('future', new Date(2025, 0, 2)),
    ];
    const weekly = buildRecordSeries(undefined, 'weekly', new Date(2025, 0, 1), events);
    expect(weekly.points.at(-2)).toMatchObject({ start: '2024-12-23', materials: 1 });
    expect(weekly.points.at(-1)).toMatchObject({ start: '2024-12-30', materials: 2 });
    const monthly = buildRecordSeries(undefined, 'monthly', new Date(2025, 0, 1), events);
    expect(monthly.points[0]).toMatchObject({ start: '2024-02-01', materials: 1 });
    expect(monthly.points[1]).toMatchObject({ start: '2024-03-01', materials: 1 });
    expect(monthly.points.at(-2)).toMatchObject({ start: '2024-12-01', materials: 2 });
    expect(monthly.points.at(-1)).toMatchObject({ start: '2025-01-01', materials: 1 });
  });

  it.each([
    { now: new Date(2024, 2, 12), instants: ['2024-03-09T23:30:00', '2024-03-10T01:30:00', '2024-03-10T03:30:00', '2024-03-11T00:30:00'] },
    { now: new Date(2024, 10, 5), instants: ['2024-11-02T23:30:00', '2024-11-03T01:30:00', '2024-11-03T03:30:00', '2024-11-04T00:30:00'] },
  ])('keeps real local days through DST changes: $instants', ({ now, instants }) => {
    const events = instants.map((instant, index) => event(String(index), new Date(instant)));
    for (const { value } of RECORD_PERIODS) {
      const series = buildRecordSeries(undefined, value, now, events);
      expect(series.points.reduce((sum, point) => sum + point.materials, 0)).toBe(4);
    }
    const series = buildRecordSeries(undefined, 'daily', now, events);
    expect(series.points.slice(-4).map(({ materials }) => materials)).toEqual([1, 2, 1, 0]);
  });

  it('treats an offset timestamp as an instant rather than copying its date prefix', () => {
    const at = '2026-10-04T23:30:00-10:00';
    const date = new Date(at);
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const series = buildRecordSeries(undefined, 'daily', today, [event('offset', at)]);
    expect(series.points.at(-1)!.materials).toBe(1);
    expect(series.points.slice(0, -1).every(({ materials }) => materials === 0)).toBe(true);
  });
});

describe('cumulative study series', () => {
  const event = (id: string, at: string) => ({
    id, materialId: 'material', at, title: '教材', url: 'https://example.com/lesson', comment: '',
  });

  it.each(RECORD_PERIODS)('keeps an empty $value history at zero', ({ value }) => {
    const series = buildRecordSeries(undefined, value, new Date(2026, 9, 5));
    expect(series.points.every(({ cumulative }) => cumulative.tested === 0 && cumulative.confirmed === 0 && cumulative.materials === 0)).toBe(true);
  });

  it('adds once on a single activity day and holds the total across later gaps', () => {
    const series = buildRecordSeries({ '2026-09-30': log(7, 2) }, 'daily', new Date(2026, 9, 5), [event('one', new Date(2026, 8, 30, 12).toISOString())]);
    expect(series.points.filter(({ end }) => end < '2026-09-30').every(({ cumulative }) => cumulative.tested === 0 && cumulative.confirmed === 0 && cumulative.materials === 0)).toBe(true);
    expect(series.points.filter(({ end }) => end >= '2026-09-30').map(({ cumulative }) => cumulative)).toEqual(Array(6).fill({ tested: 7, confirmed: 2, materials: 1 }));
  });

  it('includes old history, carries gaps and gives the same endpoint for every period without mutating input', () => {
    const daily = {
      '2026-10-05': log(7, 1), '2000-01-01': log(100, 50), '2026-09-24': log(4, 1),
      '2026-09-21': log(2, 3), '2026-09-22': log(3, 2), '2026-10-06': log(999, 999),
      '2025-02-29': log(999), '2026-09-31': log(999), 'invalid': log(999),
    };
    const events = [
      event('today', new Date(2026, 9, 5, 23, 59).toISOString()),
      event('old', new Date(2000, 0, 1, 12).toISOString()),
      event('middle', new Date(2026, 8, 24, 12).toISOString()),
      event('before', new Date(2026, 8, 21, 23, 59).toISOString()),
      event('first', new Date(2026, 8, 22, 0, 0).toISOString()),
      event('old', new Date(2026, 9, 5, 12).toISOString()),
      event('future', new Date(2026, 9, 6, 0, 0).toISOString()),
      event('invalid', 'invalid'), event('impossible', '2025-02-30T12:00:00Z'),
    ];
    const before = JSON.stringify({ daily, events });
    const today = new Date(2026, 9, 5, 12);
    for (const { value } of RECORD_PERIODS) {
      const series = buildRecordSeries(daily, value, today, events);
      expect(series.points.at(-1)!.cumulative).toEqual({ tested: 116, confirmed: 57, materials: 5 });
      for (let i = 1; i < series.points.length; i++) {
        for (const field of ['tested', 'confirmed', 'materials'] as const) {
          expect(series.points[i]!.cumulative[field] - series.points[i - 1]!.cumulative[field]).toBe(series.points[i]![field]);
        }
      }
    }
    const dailySeries = buildRecordSeries(daily, 'daily', today, events);
    expect(dailySeries.points.slice(0, 3).map(({ cumulative }) => cumulative)).toEqual([
      { tested: 105, confirmed: 55, materials: 3 },
      { tested: 105, confirmed: 55, materials: 3 },
      { tested: 109, confirmed: 56, materials: 4 },
    ]);
    expect(dailySeries.points.at(-1)).toMatchObject({ tested: 7, confirmed: 1, materials: 1 });
    expect(JSON.stringify({ daily, events })).toBe(before);
  });

  it.each(RECORD_PERIODS)('keeps history older than the entire $value window visible as a flat cumulative line', ({ value }) => {
    const series = buildRecordSeries({ '2000-01-01': log(8, 3) }, value, new Date(2026, 9, 5), [event('old', '2000-01-01T12:00:00Z')]);
    expect(series.points.every(({ tested, confirmed, materials }) => tested === 0 && confirmed === 0 && materials === 0)).toBe(true);
    expect(series.points.map(({ cumulative }) => cumulative)).toEqual(Array(series.points.length).fill({ tested: 8, confirmed: 3, materials: 1 }));
  });

  it('uses week and month ends across leap days and new year, with the current bucket ending today', () => {
    const daily = {
      '2023-01-01': log(10, 1), '2024-02-28': log(1, 2), '2024-02-29': log(2, 3),
      '2024-03-01': log(4, 1), '2024-12-29': log(8), '2024-12-30': log(16), '2025-01-01': log(32),
    };
    const events = ['2023-01-01', '2024-02-29', '2024-03-01', '2024-12-29', '2024-12-30', '2025-01-01'].map((date) => event(date, `${date}T12:00:00Z`));
    const today = new Date(2025, 0, 1, 23, 59);
    const weekly = buildRecordSeries(daily, 'weekly', today, events);
    expect(weekly.points.at(-2)).toMatchObject({ end: '2024-12-29', axisLabel: '12/29', cumulative: { tested: 25, confirmed: 7, materials: 4 } });
    expect(weekly.points.at(-1)).toMatchObject({ start: '2024-12-30', end: '2025-01-01', axisLabel: '1/1', cumulative: { tested: 73, confirmed: 7, materials: 6 } });
    const monthly = buildRecordSeries(daily, 'monthly', today, events);
    expect(monthly.points[0]).toMatchObject({ end: '2024-02-29', cumulative: { tested: 13, confirmed: 6, materials: 2 } });
    expect(monthly.points[1]).toMatchObject({ end: '2024-03-31', cumulative: { tested: 17, confirmed: 7, materials: 3 } });
    expect(monthly.points.at(-2)).toMatchObject({ end: '2024-12-31', cumulative: { tested: 41, confirmed: 7, materials: 5 } });
    for (const { value } of RECORD_PERIODS) expect(buildRecordSeries(daily, value, today, events).points.at(-1)!.cumulative).toEqual({ tested: 73, confirmed: 7, materials: 6 });
  });

  it.each([
    { today: new Date(2024, 2, 12), days: ['2024-03-09', '2024-03-10', '2024-03-11', '2024-03-12'] },
    { today: new Date(2024, 10, 5), days: ['2024-11-02', '2024-11-03', '2024-11-04', '2024-11-05'] },
  ])('keeps cumulative daily boundaries across DST: $days', ({ today, days }) => {
    const daily = { '2000-01-01': log(5), ...Object.fromEntries(days.map((date, index) => [date, log(index + 1)])) };
    const events = [event('old', '2000-01-01T12:00:00Z'), ...days.map((date) => event(date, new Date(`${date}T00:30:00`).toISOString()))];
    expect(buildRecordSeries(daily, 'daily', today, events).points.slice(-4).map(({ cumulative }) => cumulative)).toEqual([
      { tested: 6, confirmed: 0, materials: 2 }, { tested: 8, confirmed: 0, materials: 3 },
      { tested: 11, confirmed: 0, materials: 4 }, { tested: 15, confirmed: 0, materials: 5 },
    ]);
    for (const { value } of RECORD_PERIODS) expect(buildRecordSeries(daily, value, today, events).points.at(-1)!.cumulative).toEqual({ tested: 15, confirmed: 0, materials: 5 });
  });

  it('assigns offset instants by local day and removes an undone event from all later cumulative points', () => {
    const offset = event('offset', '2026-10-04T23:30:00-10:00');
    const today = new Date(offset.at);
    const old = event('old', '2000-01-01T12:00:00Z');
    for (const { value } of RECORD_PERIODS) {
      const before = buildRecordSeries(undefined, value, today, [old, offset]);
      expect(before.points.at(-1)!.cumulative.materials).toBe(2);
      expect(before.points.slice(0, -1).every(({ cumulative }) => cumulative.materials === 1)).toBe(true);
      const after = buildRecordSeries(undefined, value, today, [offset]);
      expect(after.points.at(-1)!.cumulative.materials).toBe(1);
      expect(after.points.slice(0, -1).every(({ cumulative }) => cumulative.materials === 0)).toBe(true);
    }
  });

  it('keeps every supported ISO precision and offset consistent with material validation and counts', () => {
    const instants = [
      '2026-10-05T00:00:00Z', '2026-10-05T00:00:00.1Z', '2026-10-05T00:00:00.12Z', '2026-10-05T00:00:00.123Z',
      '2026-10-05T09:00:00+09:00', '2026-10-04T14:00:00-10:00', '2026-10-05T00:00:00+00:00',
    ];
    const events = instants.map((instant, index) => event(String(index), instant));
    const material = { id: 'material', title: '教材', url: 'https://example.com/lesson', comment: '', createdAt: instants[0]!, updatedAt: instants[0]! };
    expect(validateMaterialData({ materials: [material], materialStudyEvents: events }).ok).toBe(true);
    expect(countMaterialStudies(events)).toBe(7);
    for (const { value } of RECORD_PERIODS) expect(buildRecordSeries(undefined, value, new Date(instants[3]!), events).points.at(-1)!.cumulative.materials).toBe(7);
    expect(validateMaterialData({ materials: [material], materialStudyEvents: [event('impossible', '2025-02-30T12:00:00Z')] }).ok).toBe(false);
  });
});
