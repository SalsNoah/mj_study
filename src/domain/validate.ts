import { countByRankSuit, countRedsBySuit, isTileCode } from './tiles';
import { validateMeldShape } from './melds';
import { LIMITS, type Problem, type TileCode } from './types';

export type ValidationIssue = {
  level: 'error' | 'warn';
  code: string;
  message: string;
};

function allTilesOf(problem: Pick<
  Problem,
  'concealed' | 'drawn' | 'melds' | 'doraIndicators'
>): TileCode[] {
  const tiles: TileCode[] = [...problem.concealed];
  if (problem.drawn) tiles.push(problem.drawn);
  for (const m of problem.melds) tiles.push(...m.tiles);
  tiles.push(...problem.doraIndicators);
  return tiles;
}

/** 通常14枚形: 手牌+ツモ+副露組数×3 = 14（槓も3枚相当） */
export function standardTileCount(problem: Pick<Problem, 'concealed' | 'drawn' | 'melds'>): number {
  return problem.concealed.length + (problem.drawn ? 1 : 0) + problem.melds.length * 3;
}

export function isSafeHttpUrl(url: string): boolean {
  if (!url) return true;
  if (url.length > LIMITS.sourceUrl) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateProblem(
  problem: Pick<
    Problem,
    | 'title'
    | 'concealed'
    | 'drawn'
    | 'melds'
    | 'doraIndicators'
    | 'answerEnabled'
    | 'acceptedDiscards'
    | 'explanation'
    | 'privateMemo'
    | 'tagIds'
    | 'sourceUrl'
    | 'attachments'
    | 'context'
  >,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (problem.title.length > LIMITS.title) {
    issues.push({ level: 'error', code: 'title_len', message: `タイトルは${LIMITS.title}文字以内です` });
  }
  if (problem.explanation.length > LIMITS.explanation) {
    issues.push({ level: 'error', code: 'explanation_len', message: `解説は${LIMITS.explanation}文字以内です` });
  }
  if (problem.privateMemo.length > LIMITS.privateMemo) {
    issues.push({ level: 'error', code: 'memo_len', message: `メモは${LIMITS.privateMemo}文字以内です` });
  }
  if (problem.tagIds.length > LIMITS.tagsPerProblem) {
    issues.push({ level: 'error', code: 'tags_per', message: `タグは${LIMITS.tagsPerProblem}個までです` });
  }
  if (problem.attachments.length > LIMITS.attachmentsMax) {
    issues.push({ level: 'error', code: 'attach_max', message: `参考画像は${LIMITS.attachmentsMax}枚までです` });
  }
  if (problem.concealed.length > LIMITS.concealedMax) {
    issues.push({ level: 'error', code: 'concealed_max', message: '手牌は最大14枚です' });
  }
  if (problem.melds.length > LIMITS.meldsMax) {
    issues.push({ level: 'error', code: 'melds_max', message: '副露は最大4組です' });
  }
  if (problem.doraIndicators.length > LIMITS.doraMax) {
    issues.push({ level: 'error', code: 'dora_max', message: 'ドラ表示牌は最大5枚です' });
  }

  if (
    problem.concealed.length === 0 &&
    !problem.drawn &&
    problem.melds.length === 0
  ) {
    issues.push({
      level: 'error',
      code: 'empty_hand',
      message: '手牌・ツモ・副露のいずれかを入力してください',
    });
  }

  for (const m of problem.melds) {
    const check = validateMeldShape(m.type, m.tiles, m.from, m.calledIndex, m.addedIndex);
    if (!check.ok) {
      issues.push({ level: 'error', code: 'meld_invalid', message: check.reason });
    }
  }

  const all = allTilesOf(problem);
  for (const t of all) {
    if (!isTileCode(t)) {
      issues.push({ level: 'error', code: 'bad_tile', message: `不正な牌コード: ${t}` });
    }
  }

  // 同一牌（赤通常合わせ）5枚以上は保存不可
  for (const [key, n] of countByRankSuit(all)) {
    if (n >= 5) {
      issues.push({
        level: 'error',
        code: 'tile_over5',
        message: `同じ牌が5枚以上あります（${key}）`,
      });
    }
  }

  // 各色の赤五は最大1枚
  for (const [suit, n] of countRedsBySuit(all)) {
    if (n > 1) {
      issues.push({
        level: 'error',
        code: 'red_dup',
        message: `赤五${suit}は最大1枚です`,
      });
    }
  }

  // 正解
  if (problem.answerEnabled) {
    if (problem.acceptedDiscards.length === 0) {
      issues.push({
        level: 'error',
        code: 'answer_empty',
        message: '正解設定ONのときは正解牌を1枚以上選んでください',
      });
    }
    const pool = new Set<TileCode>([
      ...problem.concealed,
      ...(problem.drawn ? [problem.drawn] : []),
    ]);
    for (const a of problem.acceptedDiscards) {
      if (!pool.has(a)) {
        issues.push({
          level: 'error',
          code: 'answer_missing',
          message: `正解に指定した牌「${a}」が手牌・ツモにありません`,
        });
      }
    }
  }

  if (problem.sourceUrl && !isSafeHttpUrl(problem.sourceUrl)) {
    issues.push({
      level: 'error',
      code: 'bad_url',
      message: '出典URLは http/https のみ、最大2048文字です',
    });
  }

  // 枚数警告（非阻害）
  const count = standardTileCount(problem);
  if (
    problem.concealed.length > 0 ||
    problem.drawn ||
    problem.melds.length > 0
  ) {
    if (count !== 14) {
      issues.push({
        level: 'warn',
        code: 'nonstandard_count',
        message: `通常の14枚形ではありません（現在 ${count} 枚相当）。学習メモとして保存できます`,
      });
    }
  }

  // 条件レンジ
  const c = problem.context;
  if (c.handNumber !== null && (c.handNumber < 1 || c.handNumber > 4)) {
    issues.push({ level: 'error', code: 'hand_number', message: '局番号は1〜4です' });
  }
  if (c.turn !== null && (c.turn < 1 || c.turn > 30)) {
    issues.push({ level: 'error', code: 'turn', message: '巡目は1〜30です' });
  }
  if (c.honba !== null && (c.honba < 0 || c.honba > 99)) {
    issues.push({ level: 'error', code: 'honba', message: '本場は0〜99です' });
  }
  if (c.riichiSticks !== null && (c.riichiSticks < 0 || c.riichiSticks > 99)) {
    issues.push({ level: 'error', code: 'riichi', message: '供託は0〜99です' });
  }
  if (c.ownRank !== null && (c.ownRank < 1 || c.ownRank > 4)) {
    issues.push({ level: 'error', code: 'rank', message: '順位は1〜4です' });
  }
  for (const [k, v] of Object.entries(c.scores)) {
    if (v !== null && (v < -100000 || v > 200000 || !Number.isInteger(v))) {
      issues.push({
        level: 'error',
        code: 'score',
        message: `${k}の持ち点は -100000〜200000 の整数です`,
      });
    }
  }

  return issues;
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.level === 'error');
}

/** 内容変更で contentRevision を増やす対象か（タイトル・タグ・私用メモのみは対象外） */
export function isContentRevisionChange(
  before: Problem,
  after: Problem,
): boolean {
  return (
    JSON.stringify(before.concealed) !== JSON.stringify(after.concealed) ||
    before.drawn !== after.drawn ||
    JSON.stringify(before.melds) !== JSON.stringify(after.melds) ||
    JSON.stringify(before.doraIndicators) !== JSON.stringify(after.doraIndicators) ||
    before.answerEnabled !== after.answerEnabled ||
    JSON.stringify(before.acceptedDiscards) !== JSON.stringify(after.acceptedDiscards) ||
    before.explanation !== after.explanation ||
    JSON.stringify(before.context) !== JSON.stringify(after.context) ||
    JSON.stringify(before.attachments.map((a) => a.id)) !==
      JSON.stringify(after.attachments.map((a) => a.id)) ||
    before.sourceUrl !== after.sourceUrl
  );
}
