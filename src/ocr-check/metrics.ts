import { isTileCode } from '@/domain/tiles';
import type { MeldType } from '@/domain/types';

export const METRIC_VERSION = 'multiset-v1';
export type Token = string;
export type ObservedMeld = { type: MeldType | null; tiles: Token[] };
export type Prediction = { hand: Token[]; melds: ObservedMeld[] };
export type Truth = Prediction;
export const TYPE_NAMES: Record<MeldType, string> = { chi: 'チー', pon: 'ポン', closedKan: '暗槓', openKan: '大明槓', addedKan: '加槓' };
export const known = (t: Token) => isTileCode(t);

export function parseTokens(input: string): Token[] {
  const s = input.trim();
  if (!s) throw new Error('正解を入力してください。牌なしは「-」、不明は「?」です。');
  if (s === '-') return [];
  const tokens = s.split(/[\s,、]+/u);
  if (tokens.length > 18 || tokens.some((t) => !known(t) && t !== '?' && t !== 'back')) throw new Error('1m・0p・7zのような牌コードを空白で区切ってください。不明は ?、裏牌は back です。');
  return tokens;
}

export function makeTruth(hand: string, melds: Array<{ type: string; tiles: string }>): Truth {
  const parsed = parseTokens(hand);
  if (parsed.length > 14 || melds.length > 4) throw new Error('手牌は14枚、副露は4組までです。');
  return { hand: parsed, melds: melds.map((m) => {
    const tiles = parseTokens(m.tiles);
    const type = m.type === '?' ? null : m.type as MeldType;
    if (type !== null && !(type in TYPE_NAMES)) throw new Error('副露の種別を選んでください。');
    if (type && tiles.length !== (type === 'chi' || type === 'pon' ? 3 : 4)) throw new Error('チー・ポンは3牌、槓は実4牌を入力してください（裏牌も back として数えます）。');
    if (!type && (tiles.length < 3 || tiles.length > 4)) throw new Error('副露は3牌または4牌を入力してください。');
    return { type, tiles };
  }) };
}

/** Multiset intersection; red fives remain distinct. Unknown truth reserves unscored slots. */
export function compareTiles(expected: Token[], predicted: Token[]) {
  const truth = expected.filter(known);
  const excluded = expected.length - truth.length;
  const remaining = [...predicted];
  const missing: string[] = [];
  let matched = 0;
  for (const tile of truth) {
    const i = remaining.indexOf(tile);
    if (i < 0) missing.push(tile);
    else { matched++; remaining.splice(i, 1); }
  }
  const denominator = Math.max(truth.length, predicted.length - excluded);
  const extraCount = Math.max(0, remaining.length - excluded);
  return { matched, denominator, rate: denominator > 0 ? matched / denominator : null,
    truthKnown: truth.length, excluded, predictionUnknown: predicted.filter((t) => !known(t)).length,
    missing, unmatchedPredictions: remaining, extraCount };
}

export function evaluate(truth: Truth, prediction: Prediction) {
  const hand = compareTiles(truth.hand, prediction.hand);
  const groups = Array.from({ length: Math.max(truth.melds.length, prediction.melds.length) }, (_, i) => ({
    index: i, ...compareTiles(truth.melds[i]?.tiles ?? [], prediction.melds[i]?.tiles ?? []),
    expectedType: truth.melds[i]?.type ?? null, predictedType: prediction.melds[i]?.type ?? null,
  }));
  const meldTiles = groups.reduce((a, g) => ({ matched: a.matched + g.matched, denominator: a.denominator + g.denominator, excluded: a.excluded + g.excluded, predictionUnknown: a.predictionUnknown + g.predictionUnknown }), { matched: 0, denominator: 0, excluded: 0, predictionUnknown: 0 });
  const typeExcluded = truth.melds.filter((m) => m.type === null).length;
  const typeDenominator = Math.max(truth.melds.length - typeExcluded, prediction.melds.length - typeExcluded);
  const typeMatched = truth.melds.filter((m, i) => m.type !== null && m.type === prediction.melds[i]?.type).length;
  const fullyKnown = hand.excluded === 0 && groups.every((g) => g.excluded === 0) && typeExcluded === 0;
  const hasTargets = hand.truthKnown + truth.melds.reduce((n, m) => n + m.tiles.filter(known).length, 0) > 0;
  const exact = !fullyKnown || !hasTargets ? null : hand.matched === hand.denominator && groups.every((g) => g.matched === g.denominator) && typeMatched === typeDenominator && truth.melds.length === prediction.melds.length;
  return { metricVersion: METRIC_VERSION, hand, meldTiles: { ...meldTiles, rate: meldTiles.denominator ? meldTiles.matched / meldTiles.denominator : null },
    meldTypes: { matched: typeMatched, denominator: typeDenominator, excluded: typeExcluded, rate: typeDenominator ? typeMatched / typeDenominator : null },
    groups, exact, exactDenominator: exact === null ? 0 : 1, truthMeldCount: truth.melds.length, predictionMeldCount: prediction.melds.length };
}

export function csv(rows: unknown[][]): string {
  const cell = (v: unknown) => {
    let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[\s\uFEFF]*[=+@-]/u.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
