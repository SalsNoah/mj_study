import type { Store } from './types';

export type TagRecord = {
  key: string;
  name: string;
  problemCount: number;
  correct: number;
  answered: number;
  accuracy: number | null;
  understood: number;
  uncertain: number;
  unrated: number;
};

/** Read-only: current membership/content, weighted by actual automatically judged answers. */
export function buildTagRecords(
  store: Pick<Store, 'problems' | 'tags' | 'study' | 'attempts'>,
): TagRecord[] {
  const makeRow = (key: string, name: string): TagRecord => ({
    key, name, problemCount: 0, correct: 0, answered: 0, accuracy: null,
    understood: 0, uncertain: 0, unrated: 0,
  });
  const tags = new Map(store.tags.map((tag) => [tag.id, makeRow(`tag:${tag.id}`, tag.name)]));
  const tagless = makeRow('tagless', 'タグなし');
  const unknown = makeRow('unknown', '不明なタグ');
  const study = new Map(store.study.map((state) => [state.problemId, state]));
  const memberships = new Map<string, TagRecord[]>();
  for (const problem of store.problems) {
    const rows = new Set<TagRecord>();
    if (problem.tagIds.length === 0) rows.add(tagless);
    for (const id of problem.tagIds) rows.add(tags.get(id) ?? unknown);
    memberships.set(problem.id, [...rows]);
    const understanding = study.get(problem.id)?.understanding ?? 'unrated';
    for (const row of rows) {
      row.problemCount++;
      if (understanding === 'understood') row.understood++;
      else if (understanding === 'uncertain') row.uncertain++;
      else row.unrated++;
    }
  }
  for (const attempt of store.attempts) {
    if (attempt.result !== 'correct' && attempt.result !== 'incorrect') continue;
    if (attempt.contentRevision !== (study.get(attempt.problemId)?.contentRevision ?? 0)) continue;
    // Removed problems have no current membership. Never infer it from their history.
    for (const row of memberships.get(attempt.problemId) ?? []) {
      row.answered++;
      if (attempt.result === 'correct') row.correct++;
    }
  }
  return [...tags.values(), ...[tagless, unknown].filter((row) => row.problemCount > 0)]
    .map((row) => ({ ...row, accuracy: row.answered === 0 ? null : row.correct / row.answered }));
}
