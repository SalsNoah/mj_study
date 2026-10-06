import { isInTest } from './quiz';
import type { Attempt, Problem, StudyState, Understanding } from './types';

/** A run keeps the questions/revisions selected at its start, including its filters. */
export type SessionQuestion = { problem: Problem; contentRevision: number };
export type SessionResult = { attempt: Attempt; understanding: Understanding };
export type SessionResults = Record<string, SessionResult>;

export function snapshotSessionQuestions(
  problems: readonly Problem[], study: readonly StudyState[],
): SessionQuestion[] {
  const revisions = new Map(study.map((s) => [s.problemId, s.contentRevision]));
  return problems.map((problem) => ({ problem, contentRevision: revisions.get(problem.id) ?? 0 }));
}

/** Only answered questions from this run qualify; global ratings are never consulted. */
export function sessionRetestCandidates(
  sessionId: string,
  questions: readonly SessionQuestion[],
  results: SessionResults,
  problems: readonly Problem[],
  study: readonly StudyState[],
): { problems: Problem[]; excludedCount: number } {
  const wanted = new Map<string, number>();
  for (const { attempt, understanding } of Object.values(results)) {
    const question = questions[attempt.questionIndex];
    if (attempt.sessionId !== sessionId || !question ||
      question.problem.id !== attempt.problemId || question.contentRevision !== attempt.contentRevision) continue;
    if (attempt.result === 'incorrect' || understanding === 'uncertain') {
      wanted.set(attempt.problemId, attempt.contentRevision);
    }
  }
  const currentProblems = new Map(problems.map((p) => [p.id, p]));
  const currentStudy = new Map(study.map((s) => [s.problemId, s]));
  const eligible: Problem[] = [];
  for (const [id, revision] of wanted) {
    const problem = currentProblems.get(id);
    const state = currentStudy.get(id);
    if (problem?.answerEnabled && isInTest(state) && (state?.contentRevision ?? 0) === revision) {
      eligible.push(problem);
    }
  }
  return { problems: eligible, excludedCount: wanted.size - eligible.length };
}
