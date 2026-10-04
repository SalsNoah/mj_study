import { describe, expect, it } from 'vitest';
import { analyzeHand, structuralShanten, tileCounts, type AnalysisHand } from './ukeire';
import { parseHandNotation } from './parse';
import { createMeld } from './melds';
import type { Meld, TileCode } from './types';
import fixtures from './fixtures/ukeire-independent.json';

function tiles(notation: string): TileCode[] {
  const result = parseHandNotation(notation);
  if (!result.ok) throw new Error(result.reason);
  return result.tiles;
}
function meld(notation: string): Meld {
  const t = tiles(notation);
  const type = t.length === 4 ? 'closedKan' : new Set(t).size === 1 ? 'pon' : 'chi';
  const result = createMeld(type, t, type === 'closedKan' ? null : 'left', type === 'closedKan' ? null : 0);
  if (!result.ok) throw new Error(result.reason);
  return result.meld;
}
function hand(notation: string, overrides: Partial<AnalysisHand> = {}): AnalysisHand {
  return { concealed: tiles(notation), drawn: null, melds: [], doraIndicators: [], ...overrides };
}

describe('independently calculated target-hand / exhaustive draw fixtures', () => {
  for (const f of fixtures) {
    it(`${f.id}: ${f.note}`, () => {
      const result = analyzeHand(hand(f.hand, { melds: f.melds.map(meld), doraIndicators: tiles(f.dora ?? '') }));
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      const value = f.discard ? result.discards.find((row) => row.discard === f.discard) : result.current;
      expect(value).toBeTruthy();
      expect(value!.shanten).toBe(f.expectedShanten);
      expect(Object.fromEntries(value!.effective.filter((t) => t.remaining > 0).map((t) => [t.tile, t.remaining]))).toEqual(f.expectedUkeire);
      expect(value!.kinds).toBe(f.expectedTypeCount);
      expect(value!.total).toBe(f.expectedRemaining);
    });
  }
});

describe('analysis contract', () => {
  it.each(['123m456m789p123s55z', '1122m3344p5566s77z', '119m19p19s1234567z'])('completed shape %s is -1', (notation) => {
    expect(structuralShanten(tileCounts(tiles(notation)))).toBe(-1);
  });
  it('drawn is counted once and agrees with merged editor hand', () => {
    const input = hand('123m123p123s45s77z', { drawn: '0s' });
    expect(analyzeHand(input)).toEqual(analyzeHand(hand('123m123p123s405s77z')));
  });
  it('does not mutate hand, meld, indicator or inputs; repeated calls agree', () => {
    const input = hand('23m456p789s55z', { drawn: '1z', melds: [meld('1111m')], doraIndicators: ['4m'] });
    const copy = structuredClone(input);
    const result = analyzeHand(input);
    expect(input).toEqual(copy);
    expect(analyzeHand(input)).toEqual(result);
  });
  it('groups identical tiles but keeps red and normal discard choices', () => {
    const result = analyzeHand(hand('123m123p123s405s77z'));
    if (result.status !== 'ready') throw new Error('not ready');
    expect(result.discards.filter((r) => r.discard === '7z')).toHaveLength(1);
    const red = result.discards.find((r) => r.discard === '0s')!;
    const normal = result.discards.find((r) => r.discard === '5s')!;
    expect({ ...red, discard: '5s' }).toEqual(normal);
  });
  it('separates zero remaining shape tiles from the positive kinds and total', () => {
    const result = analyzeHand(hand('123m456m789p22s55z', { doraIndicators: tiles('22s55z') }));
    if (result.status !== 'ready') throw new Error('not ready');
    expect(result.current!.effective.map((t) => [t.tile, t.remaining])).toEqual([['2s', 0], ['5z', 0]]);
    expect(result.current!.total).toBe(0);
  });
  it.each(['', '123m', '123m123p123s11z', '123m123p123s111z111s'])('partial / excess %s is not analyzed', (notation) => {
    expect(analyzeHand(hand(notation)).status).toBe('partial');
  });
  it('rejects red+normal >4 across hand, drawn, meld and dora', () => {
    const input = hand('123m123p123s5s', { drawn: '0s', melds: [meld('555s')] });
    expect(analyzeHand(input).status).toBe('invalid');
    expect(analyzeHand(hand('1111m234p567p789s', { doraIndicators: ['1m'] })).status).toBe('invalid');
  });
  it('rejects duplicate red, invalid tile, broken meld and too many melds', () => {
    expect(analyzeHand(hand('00m123p123s567s11z')).status).toBe('invalid');
    expect(analyzeHand({ ...hand(''), concealed: ['8z' as TileCode] }).status).toBe('invalid');
    const broken = { ...meld('123m'), tiles: tiles('124m') };
    expect(analyzeHand(hand('123p123s11z', { melds: [broken] })).status).toBe('invalid');
    expect(analyzeHand(hand('', { melds: ['111m','222p','333s','444z','555z'].map(meld) })).status).toBe('invalid');
  });
  it.each(['openKan', 'closedKan', 'addedKan'] as const)('counts %s as one fixed meld and four known tiles', (type) => {
    const m = { ...meld('1111m'), type, from: type === 'closedKan' ? null : 'left' as const, calledIndex: type === 'closedKan' ? null : 0, addedIndex: type === 'addedKan' ? 0 : null };
    const result = analyzeHand(hand('23m456p789s55z', { melds: [m] }));
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.current!.effective.map((t) => t.tile)).toEqual(['4m']);
  });
});
