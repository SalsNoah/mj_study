import { describe, expect, it } from 'vitest';
import { createMeld, validateMeldShape } from './melds';
import { sortConcealed } from './sort';
import { judgeDiscard } from './quiz';
import { validateProblem, hasErrors } from './validate';
import { emptyContext, type Problem } from './types';
import { parseHandNotation } from './parse';
import { normalizeTagKey, validateTagName } from './tags';

function t(n: string) {
  const r = parseHandNotation(n);
  if (!r.ok) throw new Error(r.reason);
  return r.tiles;
}

describe('sort A02', () => {
  it('sorts suits and red after normal 5', () => {
    expect(sortConcealed(t('5m0m3p1z2m'))).toEqual(t('2m5m0m3p1z'));
  });
});

describe('melds A03 A04', () => {
  it('accepts chi/pon/kans', () => {
    expect(createMeld('chi', t('123m'), 'left', 0).ok).toBe(true);
    expect(createMeld('pon', t('5p5p0p'), 'opposite', 1).ok).toBe(true);
    expect(createMeld('openKan', t('5s5s5s5s'), 'right', 0).ok).toBe(true);
    expect(createMeld('closedKan', t('1z1z1z1z'), null, null, null).ok).toBe(true);
    expect(createMeld('addedKan', t('3m3m3m3m'), 'left', 0, 1).ok).toBe(true);
  });
  it('rejects invalid chi and from', () => {
    expect(validateMeldShape('chi', t('124m'), 'left', 0, null).ok).toBe(false);
    expect(validateMeldShape('chi', t('123m'), 'right', 0, null).ok).toBe(false);
  });
});

describe('validate A04 A05 A07 A08', () => {
  const base = {
    title: '',
    concealed: t('123m'),
    drawn: null as Problem['drawn'],
    melds: [] as Problem['melds'],
    doraIndicators: [] as Problem['doraIndicators'],
    answerEnabled: false,
    acceptedDiscards: [] as Problem['acceptedDiscards'],
    explanation: '',
    privateMemo: '',
    tagIds: [] as string[],
    sourceUrl: '',
    attachments: [] as Problem['attachments'],
    context: emptyContext(),
  };

  it('rejects 5 of same tile and double red', () => {
    const five = validateProblem({
      ...base,
      concealed: ['1m', '1m', '1m', '1m', '1m'],
    });
    expect(hasErrors(five)).toBe(true);
    const reds = validateProblem({
      ...base,
      concealed: t('0m'),
      drawn: '0m',
    });
    expect(reds.some((i) => i.code === 'red_dup')).toBe(true);
  });

  it('warns nonstandard count but allows', () => {
    const issues = validateProblem({ ...base, concealed: t('123m') });
    expect(hasErrors(issues)).toBe(false);
    expect(issues.some((i) => i.code === 'nonstandard_count')).toBe(true);
  });

  it('no warn for standard 14', () => {
    // 手牌14枚（ツモ枠なし）
    const issues = validateProblem({
      ...base,
      concealed: t('123456789m12345p').slice(0, 14),
      drawn: null,
    });
    expect(issues.some((i) => i.code === 'nonstandard_count')).toBe(false);
  });

  it('rejects stale answer tiles', () => {
    const issues = validateProblem({
      ...base,
      concealed: t('123m'),
      answerEnabled: true,
      acceptedDiscards: ['9m'],
    });
    expect(issues.some((i) => i.code === 'answer_missing')).toBe(true);
  });

  it('keeps null vs 0 distinct in context shape', () => {
    const ctx = emptyContext();
    expect(ctx.honba).toBeNull();
    expect(ctx.scores.east).toBeNull();
  });
});

describe('quiz A20 A21', () => {
  it('same tile different positions equal', () => {
    expect(judgeDiscard('1m', ['1m', '2m'])).toBe('correct');
    expect(judgeDiscard('3m', ['1m', '2m'])).toBe('incorrect');
  });
  it('distinguishes red and normal 5', () => {
    expect(judgeDiscard('5m', ['0m'])).toBe('incorrect');
    expect(judgeDiscard('0m', ['0m', '5m'])).toBe('correct');
    expect(judgeDiscard('5m', ['0m', '5m'])).toBe('correct');
  });
});

describe('tags A09', () => {
  it('normalizes and prevents dup ignoring case', () => {
    expect(normalizeTagKey('  ABC ')).toBe('abc');
    const v = validateTagName('abc', [{ id: '1', name: 'ABC' }]);
    expect(v.ok).toBe(false);
  });
});
