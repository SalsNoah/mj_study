import { describe, expect, it } from 'vitest';
import { adjustUkeire, parseRemainingInput, remainingLimits, remainingSessionKey } from './remaining';
import { analyzeHand, type AnalysisHand } from './ukeire';
import { parseHandNotation } from './parse';
import { createMeld } from './melds';

function input(notation = '123m123p123s405s77z'): AnalysisHand {
  const parsed = parseHandNotation(notation);
  if (!parsed.ok) throw new Error('fixture');
  return { concealed: parsed.tiles, drawn: null, melds: [], doraIndicators: [] };
}
describe('remaining count adjustments', () => {
  it.each(['', '-1', '1.5', '1e0', 'abc', ' 1', '5', '999999999999999999999'])('rejects %j without a count', (text) => {
    expect(parseRemainingInput(text, 4).ok).toBe(false);
  });
  it.each([0,1,2,3,4])('accepts integer %i', (n) => {
    expect(parseRemainingInput(String(n), 4)).toEqual({ ok: true, value: n });
  });
  it('handles the zero upper limit', () => {
    expect(parseRemainingInput('0', 0)).toEqual({ ok: true, value: 0 });
    expect(parseRemainingInput('1', 0).ok).toBe(false);
  });
  it('counts red/normal, drawn, actual kan tiles and indicators exactly once', () => {
    const hand = input('23m405p678s11z');
    const kan = createMeld('closedKan', ['1m','1m','1m','1m'], null, null);
    if (!kan.ok) throw new Error('fixture');
    hand.melds = [kan.meld]; hand.drawn = '5p'; hand.doraIndicators = ['0s'];
    const limits = remainingLimits(hand);
    expect(limits[0]).toBe(0);
    expect(limits[13]).toBe(1);
    expect(limits[22]).toBe(3);
  });
  it('applies to every discard without changing shanten, shape or input', () => {
    const hand = input(); const limits = remainingLimits(hand); const analysis = analyzeHand(hand);
    if (analysis.status !== 'ready') throw new Error('fixture');
    const before = structuredClone(analysis);
    const adjusted = analysis.discards.map((row) => adjustUkeire(row, { '3s': 0, '6s': 1 }, limits));
    for (let i=0; i<adjusted.length; i++) {
      expect(adjusted[i]!.shanten).toBe(analysis.discards[i]!.shanten);
      expect(adjusted[i]!.effective.map((tile) => [tile.tile, tile.shanten])).toEqual(analysis.discards[i]!.effective.map((tile) => [tile.tile, tile.shanten]));
      expect(adjusted[i]!.total).toBe(adjusted[i]!.effective.reduce((n,tile) => n+tile.remaining,0));
      expect(adjusted[i]!.kinds).toBe(adjusted[i]!.effective.filter((tile) => tile.remaining>0).length);
    }
    const red = adjusted.find((row) => row.discard === '0s')!;
    const normal = adjusted.find((row) => row.discard === '5s')!;
    expect(red.effective).toEqual(normal.effective);
    expect(red.kinds).toBe(1); expect(red.total).toBe(1);
    expect(red.effective.find((tile) => tile.tile==='3s')!.remaining).toBe(0);
    expect(analysis).toEqual(before);
    expect(adjustUkeire(analysis.discards[0]!, {}, limits)).toEqual(analysis.discards[0]);
  });
  it('rejects stale/invalid overrides rather than clamping', () => {
    const hand = input(); const analysis = analyzeHand(hand);
    if (analysis.status !== 'ready') throw new Error('fixture');
    for (const count of [-1, 5, 1.5, NaN, Infinity]) expect(() => adjustUkeire(analysis.discards[0]!, {'3s':count}, remainingLimits(hand))).toThrow(RangeError);
    expect(() => adjustUkeire(analysis.discards[0]!, {'0s':1}, remainingLimits(hand))).toThrow(RangeError);
  });
  it('resets for each physical/structural or problem change, keeps ordering only', () => {
    const hand = input(); const key = remainingSessionKey(hand, 'a');
    expect(remainingSessionKey({...hand,concealed:[...hand.concealed].reverse()},'a')).toBe(key);
    expect(remainingSessionKey(hand,'b')).not.toBe(key);
    expect(remainingSessionKey({...hand,drawn:'1z'},'a')).not.toBe(key);
    expect(remainingSessionKey({...hand,doraIndicators:['1z']},'a')).not.toBe(key);
    expect(remainingSessionKey({...hand,concealed:hand.concealed.slice(1)},'a')).not.toBe(key);
  });
});
