import previous from './fixtures/sample03-2026-10-05.3.json';
import catalog from './sampleCatalogData.json';
import { canonicalJson, contentFingerprint, SAMPLE_CATALOG_ID, SAMPLE_TAG_NAME } from './sampleIdentity';
import type { Problem, Store } from '@/domain/types';

const { sampleId, contentVersion, ...oldContent } = previous;
const oldFingerprint = contentFingerprint({ ...oldContent, id: '', createdAt: '', updatedAt: '' } as Problem, [], [SAMPLE_TAG_NAME]);
const oldIdentity = { catalogId: SAMPLE_CATALOG_ID, version: contentVersion, itemId: sampleId, fingerprint: oldFingerprint };
const latest = catalog.find(entry => entry.sampleId === sampleId)!;
const { sampleId: _sampleId, contentVersion: nextVersion, ...nextContent } = latest;
const nextFingerprint = contentFingerprint({ ...nextContent, id: '', createdAt: '', updatedAt: '' } as Problem, [], [SAMPLE_TAG_NAME]);
const contentKeys = ['title', 'concealed', 'drawn', 'melds', 'doraIndicators', 'answerEnabled', 'acceptedDiscards',
  'explanation', 'privateMemo', 'context', 'attachments', 'sourceUrl'] as const;
const allowedKeys = new Set([...contentKeys, 'tagIds', 'id', 'createdAt', 'updatedAt', 'sample']);

/** Recognize only this exact shipped provenance; never infer ownership from the title. */
export function isPriorSample03(problem: Problem): boolean {
  if (!problem || typeof problem !== 'object' || !problem.sample) return false;
  const { correctionSkipped, ...identity } = problem.sample;
  return (correctionSkipped === undefined || correctionSkipped === 'sample03-2026-10-07.1') &&
    canonicalJson(identity) === canonicalJson(oldIdentity);
}

/** Content edits, ambiguous references and unknown fields all make correction ineligible. */
export function isUneditedPriorSample03(problem: Problem, store: Store): boolean {
  return isPriorSample03(problem) && problem.sample?.correctionSkipped === undefined && Object.keys(problem).every(key => allowedKeys.has(key)) &&
    contentKeys.every(key => canonicalJson(problem[key]) === canonicalJson(oldContent[key])) &&
    Array.isArray(problem.tagIds) && problem.tagIds.length === 1 && store.tags.filter(tag => tag?.id === problem.tagIds[0]).length === 1 &&
    store.tags.find(tag => tag?.id === problem.tagIds[0])?.name === SAMPLE_TAG_NAME &&
    store.problems.filter(item => item?.id === problem.id).length === 1 &&
    store.study.filter(state => state?.problemId === problem.id).length === 1 &&
    store.study.some(state => state?.problemId === problem.id && Number.isSafeInteger(state.contentRevision) &&
      state.contentRevision >= 0 && state.contentRevision < Number.MAX_SAFE_INTEGER &&
      store.attempts.filter(attempt => attempt?.problemId === problem.id).every(attempt =>
        Number.isSafeInteger(attempt.contentRevision) && attempt.contentRevision >= 0 && attempt.contentRevision <= state.contentRevision));
}

/** Idempotent, same-ID correction. No insertion, deletion, timestamps or historical results change. */
export function reviseSample03(store: Store): Store {
  if (nextVersion !== '2026-10-07.1') return store;
  const ids = new Set(store.problems.filter(problem => isUneditedPriorSample03(problem, store)).map(problem => problem.id));
  if (!ids.size) return store;
  return { ...store,
    problems: store.problems.map(problem => ids.has(problem.id) ? { ...problem,
      title: latest.title, acceptedDiscards: [...latest.acceptedDiscards] as Problem['acceptedDiscards'],
      explanation: latest.explanation, privateMemo: latest.privateMemo,
      sample: { catalogId: SAMPLE_CATALOG_ID, version: nextVersion, itemId: sampleId, fingerprint: nextFingerprint },
    } : problem),
    // Historical attempts keep their old revision/results; current-answer stats must not reinterpret them.
    study: store.study.map(state => ids.has(state.problemId) ? { ...state, contentRevision: state.contentRevision + 1 } : state),
  };
}

/** Import/restore can normalize tag names. Retain the raw exclusion in provenance, not user content. */
export function protectSample03Edits(store: Store): Store {
  let changed = false;
  const problems = store.problems.map(problem => {
    if (!isPriorSample03(problem) || problem.sample!.correctionSkipped || isUneditedPriorSample03(problem, store)) return problem;
    changed = true;
    return { ...problem, sample: { ...problem.sample!, correctionSkipped: 'sample03-2026-10-07.1' as const } };
  });
  return changed ? { ...store, problems } : store;
}
