import { createId, nowIso } from '@/domain/ids';
import { emptyContext, type Problem, type Store } from '@/domain/types';

export function createSampleProblems(): { problems: Problem[]; tagName: string } {
  const now = nowIso();
  const tagName = 'サンプル';
  const p1: Problem = {
    id: createId('prob'),
    title: 'サンプル：リャンメンを残す',
    concealed: ['2m', '3m', '4m', '5m', '6m', '7m', '2p', '3p', '4p', '5s', '6s', '7s', '1z'],
    drawn: '8m',
    melds: [],
    doraIndicators: ['1p'],
    answerEnabled: true,
    acceptedDiscards: ['1z'],
    explanation: '字牌の孤立を切り、数牌の受け入れを残す一例です（正解は学習用の仮置き）。',
    privateMemo: '',
    tagIds: [],
    context: { ...emptyContext(), seatWind: '1z', turn: 5 },
    attachments: [],
    sourceUrl: '',
    createdAt: now,
    updatedAt: now,
  };
  const p2: Problem = {
    id: createId('prob'),
    title: 'サンプル：正解なしメモ',
    concealed: ['1s', '2s', '3s', '4s', '5s', '0s', '6s', '3p', '3p', '3p', '9m', '9m'],
    drawn: '9m',
    melds: [],
    doraIndicators: [],
    answerEnabled: false,
    acceptedDiscards: [],
    explanation: '形を眺めて自分の判断をメモする例です。正解は設定していません。',
    privateMemo: '',
    tagIds: [],
    context: emptyContext(),
    attachments: [],
    sourceUrl: '',
    createdAt: now,
    updatedAt: now,
  };
  return { problems: [p1, p2], tagName };
}

export function samplesAlreadyPresent(store: Store): boolean {
  return store.problems.some((p) => p.title.startsWith('サンプル：'));
}
