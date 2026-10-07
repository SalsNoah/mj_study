import { createId, nowIso } from '@/domain/ids';
import type { Problem, Store } from '@/domain/types';
import catalogData from './sampleCatalogData.json';
import { contentFingerprint, SAMPLE_CATALOG_ID, SAMPLE_TAG_NAME } from './sampleIdentity';

export function createSampleProblems(): { problems: Problem[]; tagName: string } {
  const now = nowIso();
  const problems = catalogData.map((entry) => {
    const problem: Problem = {
      id: createId('prob'), title: entry.title,
      concealed: [...entry.concealed] as Problem['concealed'], drawn: null,
      melds: [], doraIndicators: [...entry.doraIndicators] as Problem['doraIndicators'],
      answerEnabled: entry.answerEnabled, acceptedDiscards: [...entry.acceptedDiscards] as Problem['acceptedDiscards'],
      explanation: entry.explanation, privateMemo: entry.privateMemo, tagIds: [],
      context: structuredClone(entry.context) as Problem['context'], attachments: [], sourceUrl: entry.sourceUrl,
      createdAt: now, updatedAt: now,
    };
    problem.sample = {
      catalogId: SAMPLE_CATALOG_ID,
      version: entry.contentVersion,
      itemId: entry.sampleId,
      fingerprint: contentFingerprint(problem, [], [SAMPLE_TAG_NAME]),
    };
    return problem;
  });
  return { problems, tagName: SAMPLE_TAG_NAME };
}

/** A title or tag alone is never evidence of installed catalog content. */
export function samplesAlreadyPresent(store: Store): boolean {
  const expected = createSampleProblems().problems;
  return expected.every((template) => store.problems.some((problem) => {
    const identity = problem.sample;
    return identity?.catalogId === template.sample!.catalogId &&
      identity?.version === template.sample!.version &&
      identity?.itemId === template.sample!.itemId &&
      identity?.fingerprint === template.sample!.fingerprint;
  }));
}
