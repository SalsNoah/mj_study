import { describe, expect, it } from 'vitest';
import { compareTiles, csv, evaluate, makeTruth, parseTokens } from './metrics';

describe('multiset-v1 scoring', () => {
  it('ignores order, retains duplicates and penalizes omissions and extras', () => {
    expect(compareTiles(['1m', '1m', '2m'], ['2m', '1m', '1m']).rate).toBe(1);
    expect(compareTiles(['1m', '1m', '2m'], ['1m', '2m'])).toMatchObject({ matched: 2, denominator: 3 });
    expect(compareTiles(['1m'], ['1m', '2m'])).toMatchObject({ matched: 1, denominator: 2, extraCount: 1 });
    expect(compareTiles(['1m', '1m'], ['1m', '2m'])).toMatchObject({ matched: 1, denominator: 2 });
  });
  it('keeps red and normal five different', () => {
    expect(compareTiles(['0p'], ['5p']).rate).toBe(0);
  });
  it('does not exclude unknown predictions for known truth or reward all-unknown predictions', () => {
    expect(compareTiles(['1m', '2m'], ['?', 'back'])).toMatchObject({ rate: 0, denominator: 2, excluded: 0, predictionUnknown: 2 });
    expect(compareTiles(['1m'], [])).toMatchObject({ rate: 0, denominator: 1, missing: ['1m'] });
  });
  it('excludes only unknowable truth slots, not arbitrary extra predictions', () => {
    expect(compareTiles(['1m', 'back'], ['?', '1m'])).toMatchObject({ matched: 1, denominator: 1, excluded: 1, predictionUnknown: 1 });
    expect(compareTiles(['1m', '?'], ['1m', '2m', '3m'])).toMatchObject({ matched: 1, denominator: 2, extraCount: 1 });
    expect(compareTiles(['?', 'back'], ['1m', '?']).rate).toBeNull();
    expect(compareTiles([], []).rate).toBeNull();
  });
  it('scores kan as four physical tiles, kind separately and preserves groups', () => {
    const truth = makeTruth('9s', [{ type: 'addedKan', tiles: '5p 5p 0p 5p' }]);
    const wrongType = evaluate(truth, { hand: ['9s'], melds: [{ type: 'openKan', tiles: ['0p', '5p', '5p', '5p'] }] });
    expect(wrongType.meldTiles).toMatchObject({ rate: 1, denominator: 4 });
    expect(wrongType.meldTypes.rate).toBe(0); expect(wrongType.exact).toBe(false);
    const missing = evaluate(truth, { hand: ['9s'], melds: [] });
    expect(missing.meldTiles).toMatchObject({ rate: 0, denominator: 4 });
    expect(missing.meldTypes).toMatchObject({ rate: 0, denominator: 1 });
    expect(evaluate(truth, truth).exact).toBe(true);
  });
  it('distinguishes confirmed empty, unknown and not-entered truth', () => {
    expect(() => makeTruth('', [])).toThrow();
    const empty = makeTruth('-', []);
    expect(evaluate(empty, empty)).toMatchObject({ exact: null, exactDenominator: 0 });
    expect(evaluate(makeTruth('1m', []), { hand: ['1m'], melds: [] })).toMatchObject({ exact: true, meldTypes: { rate: null, denominator: 0 } });
    const unknown = makeTruth('1m ?', []);
    expect(evaluate(unknown, { hand: ['1m', '2m'], melds: [] }).exact).toBeNull();
  });
  it('penalizes extra meld groups when truth confirms none', () => {
    const r = evaluate(makeTruth('1m', []), { hand: ['1m'], melds: [{ type: 'pon', tiles: ['1z', '1z', '1z'] }] });
    expect(r).toMatchObject({ exact: false, meldTiles: { matched: 0, denominator: 3 }, meldTypes: { matched: 0, denominator: 1 } });
  });
  it('does not call unknown meld types exact', () => {
    const t = makeTruth('1m', [{ type: '?', tiles: '2m 2m 2m' }]);
    expect(evaluate(t, { hand: ['1m'], melds: [{ type: 'pon', tiles: ['2m', '2m', '2m'] }] })).toMatchObject({ exact: null, meldTypes: { denominator: 0, excluded: 1 } });
  });
  it('rejects typo tokens and non-four-tile kan truth', () => {
    expect(parseTokens('0m 1z back ?')).toEqual(['0m', '1z', 'back', '?']);
    expect(() => parseTokens('10m')).toThrow();
    expect(() => makeTruth('1m', [{ type: 'closedKan', tiles: '1z 1z 1z' }])).toThrow();
  });
  it('escapes spreadsheet formulae and multiline CSV', () => {
    expect(csv([['=bad.png', '@bad', 'a"b\nc']])).toBe('\uFEFF"\'=bad.png","\'@bad","a""b\nc"\r\n');
  });
});
