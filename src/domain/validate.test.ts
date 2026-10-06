import { describe, expect, it } from 'vitest';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { type Problem } from './types';
import { isContentRevisionChange } from './validate';

function legacyProblem(): Problem {
  return {
    ...createLegacySampleProblems().problems[0]!,
    concealed: ['9s', '5m', '0m', '5m'],
    drawn: '3p',
    acceptedDiscards: ['5m'],
  };
}

describe('isContentRevisionChange', () => {
  it.each([
    ['title', { title: '編集後' }],
    ['tags', { tagIds: ['tag-new'] }],
    ['private memo', { privateMemo: '覚え書き' }],
    ['hand representation only', {}],
  ] satisfies [string, Partial<Problem>][])('ignores %s edits with an equivalent merged legacy hand', (_label, edits) => {
    const before = legacyProblem();
    const after: Problem = { ...before, ...edits, concealed: ['5m', '0m', '5m', '3p', '9s'], drawn: null };
    expect(isContentRevisionChange(before, after)).toBe(false);
    expect(isContentRevisionChange(after, before)).toBe(false);
  });

  it('ignores ordering and which concealed tile occupies the legacy drawn field without mutating either input', () => {
    const before = legacyProblem();
    const after: Problem = { ...before, concealed: ['3p', '5m', '5m', '0m'], drawn: '9s' };
    const snapshot = structuredClone({ before, after });
    Object.freeze(before.concealed);
    Object.freeze(after.concealed);
    expect(isContentRevisionChange(before, after)).toBe(false);
    expect({ before, after }).toEqual(snapshot);
  });

  it('ignores ordering in hands already stored without a drawn field', () => {
    const before: Problem = { ...legacyProblem(), drawn: null };
    const after = { ...before, concealed: [...before.concealed].reverse() };
    expect(isContentRevisionChange(before, after)).toBe(false);
  });

  it.each([
    ['another tile', { concealed: ['5m', '0m', '5m', '3p', '8s'] }],
    ['red replaced by normal five', { concealed: ['5m', '5m', '5m', '3p', '9s'] }],
    ['duplicate tile removed', { concealed: ['5m', '0m', '3p', '9s'] }],
    ['duplicate tile added', { concealed: ['5m', '0m', '5m', '5m', '3p', '9s'] }],
    ['duplicate counts exchanged', { concealed: ['5m', '0m', '3p', '3p', '9s'] }],
  ] satisfies [string, Partial<Problem>][])('detects %s when merging a legacy hand', (_label, edits) => {
    const before = legacyProblem();
    const after: Problem = { ...before, drawn: null, ...edits };
    expect(isContentRevisionChange(before, after)).toBe(true);
    expect(isContentRevisionChange(after, before)).toBe(true);
  });

  it('detects an actual change confined to the legacy drawn field', () => {
    const before = legacyProblem();
    expect(isContentRevisionChange(before, { ...before, drawn: '4p' })).toBe(true);
  });

  it.each([
    ['meld', (p: Problem) => { p.melds = [{ id: 'meld', type: 'pon', tiles: ['1z', '1z', '1z'], from: 'left', calledIndex: 0, addedIndex: null }]; }],
    ['dora indicator', (p: Problem) => { p.doraIndicators = ['2p']; }],
    ['answer setting', (p: Problem) => { p.answerEnabled = false; }],
    ['accepted discard', (p: Problem) => { p.acceptedDiscards = ['0m']; }],
    ['explanation', (p: Problem) => { p.explanation = '変更した解説'; }],
    ['context', (p: Problem) => { p.context.turn = 6; }],
    ['attachment', (p: Problem) => { p.attachments = [{ id: 'image', dataUrl: 'data:image/png;base64,AA==', width: 1, height: 1 }]; }],
    ['source URL', (p: Problem) => { p.sourceUrl = 'https://example.com/source'; }],
  ])('still detects a %s change alongside equivalent hand normalization', (_label, edit) => {
    const before = legacyProblem();
    const after: Problem = { ...structuredClone(before), concealed: ['5m', '0m', '5m', '3p', '9s'], drawn: null };
    edit(after);
    expect(isContentRevisionChange(before, after)).toBe(true);
  });
});
