import { expect, it } from 'vitest';
import { createLegacySampleProblems } from '@/data/legacySamples';
import { emptyContext } from './types';
import { decodeSharePayload, DEFAULT_SHARE_OPTIONS, encodeSharePayload, extractSharePayload, type SharePayload } from './share';
const base = () => extractSharePayload(createLegacySampleProblems().problems[0]!, [], DEFAULT_SHARE_OPTIONS);
const decodeContext = (context: unknown) => decodeSharePayload(encodeSharePayload({ ...base(), context } as SharePayload));

it.each([
  { roundWind: '1z', seatWind: '1z' },
  { ...emptyContext(), scores: null },
  { ...emptyContext(), scores: {} },
  { ...emptyContext(), scores: [] },
  { ...emptyContext(), scores: { east: 25000, south: 25000, west: 25000 } },
  { ...emptyContext(), scores: { ...emptyContext().scores, east: '25000' } },
  { ...emptyContext(), scores: { ...emptyContext().scores, east: 1.5 } },
  { ...emptyContext(), handNumber: 0 },
  { ...emptyContext(), turn: 31 },
  { ...emptyContext(), honba: -1 },
  { ...emptyContext(), riichiSticks: 100 },
  { ...emptyContext(), ownRank: {} },
])('rejects malformed or out-of-range context before rendering: %j', context => {
  expect(decodeContext(context).ok).toBe(false);
});

it('preserves valid all-null legacy conditions and exact unusual point values', () => {
  const context = emptyContext();
  const allNull = decodeContext(context);
  expect(allNull.ok && allNull.payload.context).toEqual(context);
  context.scores = { east: -100000, south: 200000, west: 101, north: 0 };
  const points = decodeContext(context);
  expect(points.ok && points.payload.context.scores).toEqual(context.scores);
});

it('builds context only from declared shared fields', () => {
  const decoded = decodeContext({ ...emptyContext(), privateMemo: 'not shared', scores: { ...emptyContext().scores, extra: 'not shared' } });
  expect(decoded.ok).toBe(true);
  expect(decoded.ok && decoded.payload.context).toEqual(emptyContext());
});
