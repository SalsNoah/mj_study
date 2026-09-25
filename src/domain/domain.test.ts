import { describe, expect, it } from 'vitest';
import { createMeld, validateMeldShape } from './melds';
import { sortConcealed } from './sort';
import { judgeDiscard } from './quiz';
import { validateProblem, hasErrors } from './validate';
import { emptyContext, type Problem } from './types';
import { parseHandNotation } from './parse';
import { normalizeTagKey, validateTagName } from './tags';
import {
  decodeSharePayload,
  encodeSharePayload,
  extractSharePayload,
  payloadOmitsAnswer,
  DEFAULT_SHARE_OPTIONS,
} from './share';

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
    // 手牌13 + ツモ1 = 14
    const issues = validateProblem({
      ...base,
      concealed: t('123456789m1234p').slice(0, 13),
      drawn: '5p',
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

describe('share A27 A28 A29 A31', () => {
  const problem: Problem = {
    id: 'internal',
    title: '題',
    concealed: t('123m'),
    drawn: '4m',
    melds: [],
    doraIndicators: t('1p'),
    answerEnabled: true,
    acceptedDiscards: ['1m'],
    explanation: '解説',
    privateMemo: '秘密',
    tagIds: ['t1'],
    context: emptyContext(),
    attachments: [
      { id: 'a1', dataUrl: 'data:image/png;base64,xx', width: 1, height: 1 },
    ],
    sourceUrl: 'https://example.com',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('roundtrips and omits private fields', () => {
    const payload = extractSharePayload(problem, ['タグ'], {
      ...DEFAULT_SHARE_OPTIONS,
      includeTags: true,
      includeSourceUrl: true,
    });
    const encoded = encodeSharePayload(payload);
    const decoded = decodeSharePayload(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.payload.title).toBe('題');
    expect(JSON.stringify(decoded.payload)).not.toContain('秘密');
    expect(JSON.stringify(decoded.payload)).not.toContain('data:image');
    expect(JSON.stringify(decoded.payload)).not.toContain('internal');
  });

  it('can omit answer and explanation completely', () => {
    const payload = extractSharePayload(problem, [], {
      includeAnswerAndExplanation: false,
      includeTags: false,
      includeSourceUrl: false,
    });
    expect(payloadOmitsAnswer(payload)).toBe(true);
    const decoded = decodeSharePayload(encodeSharePayload(payload));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(payloadOmitsAnswer(decoded.payload)).toBe(true);
  });

  it('rejects broken / unknown version', () => {
    expect(decodeSharePayload('v9.abc').ok).toBe(false);
    expect(decodeSharePayload('v1.!!!').ok).toBe(false);
  });
});
