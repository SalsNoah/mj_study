import { isPriorSample03 } from './sample03Revision';
import type { Problem, Store } from '@/domain/types';
import { createLegacySampleProblems } from './legacySamples';
import { createSampleProblems } from './samples';
import { contentFingerprint, SAMPLE_TAG_NAME } from './sampleIdentity';

export type SampleUpdatePreview = {
  candidates: { id: string; title: string }[];
  additions: number;
  preservedEdited: number;
};

export type SampleRemovalPreview = {
  candidates: { id: string; title: string }[];
};

/** Removal needs both recognized provenance and unchanged content, never a title/tag guess. */
export function getSampleRemovalPreview(store: Store): SampleRemovalPreview {
  const templates = createSampleProblems().problems;
  return { candidates: store.problems.filter((problem) => {
    const template = matchingCatalogTemplate(problem, templates);
    return template && contentFingerprint(problem, store.tags) === template.sample!.fingerprint;
  }).map(({ id, title }) => ({ id, title })) };
}

/** Only known original identity is usable for deduplication; malformed metadata is ignored. */
export function matchingCatalogTemplate(problem: Problem, templates = createSampleProblems().problems): Problem | undefined {
  const identity = problem.sample;
  if (!identity || typeof identity !== 'object') return undefined;
  return templates.find(({ sample }) => sample &&
    identity.catalogId === sample.catalogId && identity.version === sample.version &&
    identity.itemId === sample.itemId && identity.fingerprint === sample.fingerprint);
}

export function missingCatalogProblems(store: Store): Problem[] {
  const templates = createSampleProblems().problems;
  return templates.filter((template) => !store.problems.some((problem) =>
    matchingCatalogTemplate(problem, [template]) ||
      template.sample?.itemId === 'sample-v2-03' && isPriorSample03(problem)));
}

export function getSampleUpdatePreview(store: Store): SampleUpdatePreview {
  const legacy = createLegacySampleProblems().problems;
  const fingerprints = new Set(legacy.map((problem) => contentFingerprint(problem, [], [SAMPLE_TAG_NAME])));
  const templates = createSampleProblems().problems;
  const candidates: SampleUpdatePreview['candidates'] = [];
  let preservedEdited = 0;
  for (const problem of store.problems) {
    const fingerprint = contentFingerprint(problem, store.tags);
    if (isPriorSample03(problem)) {
      preservedEdited++; // Kept old versions must not trigger a second copy or become removable.
    } else if (matchingCatalogTemplate(problem, templates)) {
      if (fingerprint !== problem.sample!.fingerprint) preservedEdited++;
    } else if (problem.sample === undefined && fingerprints.has(fingerprint)) {
      // Exact content match still does not prove origin. The UI requires explicit ID selection.
      candidates.push({ id: problem.id, title: problem.title });
    }
  }
  return { candidates, additions: missingCatalogProblems(store).length, preservedEdited };
}
