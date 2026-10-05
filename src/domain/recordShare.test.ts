import { describe, expect, it } from 'vitest';
import { createRecordShareSnapshot, recordShareText } from './recordShare';
import type { MaterialStudyEvent } from './types';

const event = (id: string, at: Date | string): MaterialStudyEvent => ({ id, materialId: 'private-material', at: typeof at === 'string' ? at : at.toISOString(), title: '秘密の教材名', url: 'https://example.com/private', comment: '私用のコメント' });

describe('counts-only record sharing', () => {
  it('represents empty history as zero counts, without implying a study happened', () => {
    const snapshot = createRecordShareSnapshot(undefined, undefined, new Date(2026, 9, 5, 12));
    expect(snapshot.day).toBe('2026-10-05');
    expect(snapshot.today).toEqual({ tested: 0, confirmed: 0, materials: 0 });
    expect(snapshot.total).toEqual(snapshot.today);
    expect(recordShareText(snapshot)).toBe('2026-10-05の学習記録\n今日：テスト0回・確認0回・教材0回\n累計：テスト0回・確認0回・教材0回\n#麻雀学習帳');
  });

  it('includes all earlier valid history, separates counts, and ignores future/impossible days', () => {
    const snapshot = createRecordShareSnapshot({
      '2001-01-01': { tested: 100, confirmed: 20 },
      '2026-10-04': { tested: 4, confirmed: 2 },
      '2026-10-05': { tested: 3, confirmed: 1 },
      '2026-10-06': { tested: 99, confirmed: 99 },
      '2026-02-30': { tested: 99, confirmed: 99 },
    }, [event('old', new Date(2001, 0, 1, 12)), event('today', new Date(2026, 9, 5, 12)), event('future', new Date(2026, 9, 6, 12)), event('bad', 'invalid')], new Date(2026, 9, 5, 15));
    expect(snapshot.today).toEqual({ tested: 3, confirmed: 1, materials: 1 });
    expect(snapshot.total).toEqual({ tested: 107, confirmed: 23, materials: 2 });
  });

  it('deduplicates event IDs, counts repeated study of one material, and reflects undo on the next snapshot', () => {
    const now = new Date(2026, 9, 5, 12);
    const a = event('a', now), b = event('b', now);
    const snapshot = createRecordShareSnapshot(undefined, [a, a, b], now);
    expect(snapshot.total.materials).toBe(2);
    expect(createRecordShareSnapshot(undefined, [a], now).today.materials).toBe(1);
    expect(createRecordShareSnapshot(undefined, [], now).total.materials).toBe(0);
    expect(snapshot.total.materials).toBe(2);
  });

  it.each([[2025, 0, 1], [2026, 8, 1], [2024, 2, 10], [2024, 10, 3]])('uses local midnight at year/month/DST boundaries %s/%s/%s', (year, month, day) => {
    const now = new Date(year, month, day, 0, 30);
    const midnight = new Date(year, month, day);
    const snapshot = createRecordShareSnapshot(undefined, [event('before', new Date(midnight.getTime() - 1)), event('after', midnight)], now);
    expect(snapshot.today.materials).toBe(1);
    expect(snapshot.total.materials).toBe(2);
    expect(snapshot.day).toBe(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  });

  it('keeps only approved fields and freezes counts apart from later input edits', () => {
    const daily = { '2026-10-05': { tested: 2, confirmed: 1 } };
    const events = [event('a', new Date(2026, 9, 5, 12))];
    const before = JSON.stringify({ daily, events });
    const snapshot = createRecordShareSnapshot(daily, events, new Date(2026, 9, 5, 12));
    expect(JSON.stringify({ daily, events })).toBe(before);
    const exported = JSON.stringify(snapshot) + recordShareText(snapshot);
    for (const privateText of ['秘密', 'private-material', 'example.com', '私用', '正答率', '称号']) expect(exported).not.toContain(privateText);
    daily['2026-10-05'].tested = 99;
    events.length = 0;
    expect(snapshot.today).toEqual({ tested: 2, confirmed: 1, materials: 1 });
  });

  it('formats large counts without adding or averaging rates', () => {
    const snapshot = createRecordShareSnapshot({ '2026-10-05': { tested: 999999999, confirmed: 1000000000 } }, [], new Date(2026, 9, 5));
    expect(recordShareText(snapshot)).toContain('テスト999,999,999回・確認1,000,000,000回・教材0回');
    expect(() => createRecordShareSnapshot(undefined, undefined, new Date('invalid'))).toThrow(RangeError);
  });
});
