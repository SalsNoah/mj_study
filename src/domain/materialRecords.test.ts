import { describe, expect, it } from 'vitest';
import { countMaterialStudies } from './materials';
import { MATERIAL_BADGES, materialBadgeStatus, recentMaterialStudyEvents } from './materialRecords';
import { BADGES, badgeStatus, dailyTotals, studyStreak } from './records';
import { accuracyForProblem, computeSessionStats } from './quiz';
import { buildRecordSeries } from './recordSeries';
import { emptyStore, type MaterialStudyEvent } from './types';

const event = (id: string, at = new Date(2026, 9, 5, 12).toISOString()): MaterialStudyEvent => ({
  id, materialId: 'material', at, title: `教材 ${id}`, url: 'https://example.com/lesson', comment: `学習内容 ${id}`,
});

describe('independent material study titles', () => {
  it('keeps the current material ladder explicit and separate from every problem title', () => {
    expect(MATERIAL_BADGES.map(({ need, name }) => [need, name])).toEqual([
      [0, '学びの準備'], [1, '学びの一歩'], [5, '学びの積み重ね'], [10, '学びの習慣'], [30, '学びの探究者'], [100, '学びの継続者'],
    ]);
    expect(BADGES.map(({ id, name, need, level }) => [id, name, need, level])).toEqual([
      ['egg', '卓のたまご', 0, 0], ['first', 'はじめの一打', 10, 1], ['shape', '形の探究者', 30, 2],
      ['ukeire', '受け入れ職人', 60, 3], ['oshihiki', '押し引き上手', 100, 4], ['efficiency', '牌効率の達人', 200, 5],
      ['reader', '読みの名手', 350, 6], ['tactician', '卓上の軍師', 500, 7], ['sage', '牌の賢者', 800, 8],
      ['ruler', '卓の覇者', 1200, 9], ['legend', '伝説の打ち手', 2000, 10], ['summit', '極みの打ち手', 3000, 11],
    ]);
    for (const badge of MATERIAL_BADGES) {
      expect(materialBadgeStatus(badge.need).current).toEqual(badge);
      expect(BADGES.some(({ name }) => name === badge.name)).toBe(false);
    }
  });

  it('computes progress from zero, one and many present events without persisted unlocks', () => {
    expect(materialBadgeStatus(countMaterialStudies(undefined))).toMatchObject({ current: MATERIAL_BADGES[0], remaining: 1, progress: 0 });
    expect(materialBadgeStatus(countMaterialStudies([event('1')]))).toMatchObject({ current: MATERIAL_BADGES[1], remaining: 4, progress: 0 });
    expect(materialBadgeStatus(3)).toMatchObject({ current: MATERIAL_BADGES[1], remaining: 2, progress: 0.5 });
    expect(materialBadgeStatus(99)).toMatchObject({ current: MATERIAL_BADGES[4], remaining: 1 });
    expect(materialBadgeStatus(countMaterialStudies(Array.from({ length: 100 }, (_, i) => event(String(i)))))).toMatchObject({ current: MATERIAL_BADGES[5], next: null, remaining: 0, progress: 1 });
    expect(materialBadgeStatus(500).current).toEqual(MATERIAL_BADGES[5]);
  });

  it('undo removes the same contribution from title, total, history and calendar series', () => {
    const events = Array.from({ length: 5 }, (_, i) => event(String(i)));
    const undone = events.filter(({ id }) => id !== '4');
    for (const [history, count, title] of [[events, 5, '学びの積み重ね'], [undone, 4, '学びの一歩']] as const) {
      expect(countMaterialStudies(history)).toBe(count);
      expect(materialBadgeStatus(countMaterialStudies(history)).current.name).toBe(title);
      expect(recentMaterialStudyEvents(history)).toHaveLength(count);
      expect(buildRecordSeries(undefined, 'daily', new Date(2026, 9, 5), history).points.at(-1)!.materials).toBe(count);
    }
    expect(events).toHaveLength(5);
  });

  it('sorts saved snapshots newest first, deduplicates IDs and never reads current material text', () => {
    const old = event('old', '2024-01-01T12:00:00Z');
    const newest = event('new', '2026-01-01T12:00:00Z');
    const events = [old, newest, { ...newest, title: '重複した別の内容' }];
    expect(recentMaterialStudyEvents(events)).toEqual([newest, old]);
    expect(countMaterialStudies(events)).toBe(2);
    expect(events[0]).toBe(old);
  });

  it('shows later recorded events first when timestamps tie without mutating the stored order', () => {
    const history = [event('first'), event('second'), event('third'), event('fourth')];
    expect(recentMaterialStudyEvents(history).map(({ id }) => id)).toEqual(['fourth', 'third', 'second', 'first']);
    expect(history.map(({ id }) => id)).toEqual(['first', 'second', 'third', 'fourth']);
  });

  it('leaves problem totals, streak, title and accuracy unchanged with any number of material studies', () => {
    const store = emptyStore();
    store.daily = { '2026-10-04': { tested: 1, confirmed: 3 }, '2026-10-05': { tested: 2, confirmed: 4 } };
    store.attempts = ['correct', 'incorrect'].map((result, index) => ({
      id: `attempt-${index}`, problemId: 'question', contentRevision: 0, sessionId: 'session', questionIndex: index,
      at: new Date(2026, 9, 5, 12).toISOString(), selectedTile: '1m', result,
    })) as typeof store.attempts;
    const questionMetrics = () => ({
      total: dailyTotals(store.daily), streak: studyStreak(store.daily, new Date(2026, 9, 5)),
      badge: badgeStatus(dailyTotals(store.daily).total), accuracy: accuracyForProblem(store.attempts, 'question', 0),
      session: computeSessionStats(store.attempts, []),
    });
    const before = questionMetrics();
    store.materialStudyEvents = Array.from({ length: 100 }, (_, index) => event(String(index)));
    expect(countMaterialStudies(store.materialStudyEvents)).toBe(100);
    expect(questionMetrics()).toEqual(before);
    expect(before.total.total).toBe(10);
    expect(before.streak).toBe(2);
    expect(before.badge.current.name).toBe('はじめの一打');
    expect(before.accuracy.rate).toBe(0.5);
  });
});
