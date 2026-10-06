import { expect, it } from 'vitest';
import { buildShareUrl, parseShareFromHash } from './share';

it.each([
  ['https://example.com/#/problems/1', './', 'https://example.com/'],
  ['https://example.com/mj_study/#/problems/1', './', 'https://example.com/mj_study/'],
  ['https://example.com/mj_study/index.html?old=1#/problems/1', './', 'https://example.com/mj_study/'],
  ['https://example.com/mj_study/#/library', '/another/', 'https://example.com/another/'],
  ['https://example.com/mj_study/#/library', '/', 'https://example.com/'],
  ['http://localhost:5174/mj_study/#/problems/1', './', 'http://localhost:5174/mj_study/'],
])('resolves the app base from %s and %s', (current, base, expected) => {
  const url = buildShareUrl(current, base, 'v1.Ab_-09');
  expect(url).toBe(`${expected}#share=v1.Ab_-09`);
  expect(parseShareFromHash(new URL(url).hash)).toBe('v1.Ab_-09');
});

it('distinguishes empty and malformed incoming shares from ordinary routes without throwing', () => {
  expect(parseShareFromHash('#/library')).toBeNull();
  expect(parseShareFromHash('#share=')).toBe('');
  expect(() => parseShareFromHash('#share=%E0%A4%A')).not.toThrow();
  expect(parseShareFromHash('#share=v1%2Eabc')).toBe('v1.abc');
});
