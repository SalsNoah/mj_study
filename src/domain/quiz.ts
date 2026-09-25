import type {
  Attempt,
  Problem,
  StudyState,
  TileCode,
  Understanding,
} from './types';

/** クイズ正解判定：赤五と通常五は別牌種。位置は問わない。 */
export function judgeDiscard(
  selected: TileCode,
  accepted: readonly TileCode[],
): 'correct' | 'incorrect' {
  return accepted.includes(selected) ? 'correct' : 'incorrect';
}

export type ReviewOrder = 'random' | 'weakFirst';

export type ReviewStartOptions = {
  tagIds: string[];
  order: ReviewOrder;
  count: 10 | 20 | 'all';
};

function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

type WeakBucket = 0 | 1 | 2;

function weakBucket(
  study: StudyState | undefined,
  attempts: readonly Attempt[],
  problemId: string,
  contentRevision: number,
): WeakBucket {
  // (1) 自己評価が「まだ不安」または直近自動判定が不正解
  if (study?.understanding === 'uncertain') return 0;
  const relevant = attempts
    .filter(
      (a) =>
        a.problemId === problemId &&
        a.contentRevision === contentRevision &&
        (a.result === 'correct' || a.result === 'incorrect'),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  if (relevant[0]?.result === 'incorrect') return 0;

  // (2) 未学習
  const hasReview =
    study &&
    (study.lastReviewedAt !== null ||
      study.understanding !== 'unrated' ||
      relevant.length > 0);
  if (!hasReview) return 1;

  // (3) その他
  return 2;
}

/**
 * 復習候補を並べる。同一セッション内で重複しないよう呼び出し側で消費する。
 * 苦手優先: bucket → 最終復習古い順 → 同値はランダム
 */
export function orderReviewCandidates(
  problems: readonly Problem[],
  study: readonly StudyState[],
  attempts: readonly Attempt[],
  options: ReviewStartOptions,
  random: () => number = Math.random,
): Problem[] {
  let filtered = [...problems];
  if (options.tagIds.length > 0) {
    const tagSet = new Set(options.tagIds);
    filtered = filtered.filter((p) => p.tagIds.some((id) => tagSet.has(id)));
  }

  if (options.order === 'random') {
    filtered = shuffle(filtered, random);
  } else {
    const studyMap = new Map(study.map((s) => [s.problemId, s]));
    const buckets: Record<WeakBucket, Problem[]> = { 0: [], 1: [], 2: [] };
    for (const p of filtered) {
      const s = studyMap.get(p.id);
      const rev = s?.contentRevision ?? 0;
      const bucket = weakBucket(s, attempts, p.id, rev);
      buckets[bucket].push(p);
    }
    const sortBucket = (list: Problem[]) => {
      list.sort((a, b) => {
        const sa = studyMap.get(a.id);
        const sb = studyMap.get(b.id);
        const ta = sa?.lastReviewedAt ?? '';
        const tb = sb?.lastReviewedAt ?? '';
        // 未復習（null）は古い扱い → 先頭。空文字を最小に
        if (!sa?.lastReviewedAt && sb?.lastReviewedAt) return -1;
        if (sa?.lastReviewedAt && !sb?.lastReviewedAt) return 1;
        if (ta !== tb) return ta.localeCompare(tb);
        return random() - 0.5;
      });
      return list;
    };
    filtered = [
      ...sortBucket(buckets[0]),
      ...sortBucket(buckets[1]),
      ...sortBucket(buckets[2]),
    ];
  }

  if (options.count === 'all') return filtered;
  return filtered.slice(0, options.count);
}

export type SessionStats = {
  asked: number;
  autoCorrect: number;
  autoAnswered: number;
  accuracy: number | null;
  understood: number;
  uncertain: number;
};

export function computeSessionStats(
  attempts: readonly Attempt[],
  understandings: readonly Understanding[],
): SessionStats {
  const auto = attempts.filter(
    (a) => a.result === 'correct' || a.result === 'incorrect',
  );
  const autoCorrect = auto.filter((a) => a.result === 'correct').length;
  const autoAnswered = auto.length;
  return {
    asked: attempts.length,
    autoCorrect,
    autoAnswered,
    accuracy: autoAnswered === 0 ? null : autoCorrect / autoAnswered,
    understood: understandings.filter((u) => u === 'understood').length,
    uncertain: understandings.filter((u) => u === 'uncertain').length,
  };
}

/** 現在の contentRevision だけの正答率 */
export function accuracyForProblem(
  attempts: readonly Attempt[],
  problemId: string,
  contentRevision: number,
): { correct: number; total: number; rate: number | null } {
  const relevant = attempts.filter(
    (a) =>
      a.problemId === problemId &&
      a.contentRevision === contentRevision &&
      (a.result === 'correct' || a.result === 'incorrect'),
  );
  const correct = relevant.filter((a) => a.result === 'correct').length;
  const total = relevant.length;
  return {
    correct,
    total,
    rate: total === 0 ? null : correct / total,
  };
}
