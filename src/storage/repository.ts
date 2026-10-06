import {
  emptyStore,
  LIMITS,
  SCHEMA_VERSION,
  STORAGE_KEY,
  type Attempt,
  type LearningMaterial,
  type MaterialStudyEvent,
  type Problem,
  type Settings,
  type Store,
  type StudyState,
  type Tag,
} from '../domain/types';
import { createId, nowIso } from '../domain/ids';
import { isContentRevisionChange, validateProblem, hasErrors } from '../domain/validate';
import { normalizeTagKey, validateTagName, canAddTag } from '../domain/tags';
import type { SharePayload } from '../domain/share';
import { createMeld } from '../domain/melds';
import { SampleCatalogStorage, validCatalogReceipts, type SampleRestoreResult } from './sampleCatalogStorage';
import { canonicalJson } from '../data/sampleIdentity';
import { applyAttemptToStudy, bumpDaily, dayKey, dayKeyFromIso, normalizeStore } from '../domain/records';
import { MATERIAL_LIMITS, materialSourceIds, materialStudySourceIds, validateLearningMaterial, validateMaterialData } from '../domain/materials';

export type SaveResult =
  | { ok: true; store: Store }
  | { ok: false; reason: string; code: 'quota' | 'conflict' | 'validation' | 'access' | 'corrupt' | 'size'; duplicateMaterialId?: string };

export type LoadResult =
  | { ok: true; store: Store }
  | {
      ok: false;
      reason: string;
      code: 'missing' | 'corrupt' | 'unknown_schema' | 'access';
      raw?: string;
    };

function utf16Size(text: string): number {
  return text.length * 2;
}

export function estimateStoreSize(store: Store): number {
  return utf16Size(JSON.stringify(store));
}

export function sizeStatus(bytes: number): 'ok' | 'warn' | 'over' {
  if (bytes >= LIMITS.storageMaxBytes) return 'over';
  if (bytes >= LIMITS.storageWarnBytes) return 'warn';
  return 'ok';
}

function isStoreShape(value: unknown): value is Store {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    o.schemaVersion === SCHEMA_VERSION &&
    typeof o.revision === 'number' &&
    Array.isArray(o.problems) &&
    Array.isArray(o.tags) &&
    Array.isArray(o.study) &&
    Array.isArray(o.attempts) &&
    !!o.settings &&
    typeof (o.settings as Settings).autoSort === 'boolean'
  );
}

function sameMaterialSnapshot(a: MaterialStudyEvent, b: MaterialStudyEvent): boolean {
  return a.at === b.at && a.title === b.title && a.url === b.url && a.comment === b.comment;
}

function validOrphanHistory(backup: Store): boolean {
  const activeIds = new Set(backup.problems.map((problem) => problem?.id));
  const studies = backup.study.filter((state) => !activeIds.has(state?.problemId));
  const attempts = backup.attempts.filter((attempt) => !activeIds.has(attempt?.problemId));
  const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
  return studies.every((state) => state && nonempty(state.problemId) && Number.isFinite(state.confirmationCount) &&
    Number.isFinite(state.contentRevision)) && new Set(studies.map((state) => state.problemId)).size === studies.length &&
    attempts.every((attempt) => attempt && nonempty(attempt.problemId) && nonempty(attempt.id) &&
      typeof attempt.at === 'string' && Number.isFinite(Date.parse(attempt.at)) &&
      Number.isFinite(attempt.contentRevision) && nonempty(attempt.sessionId) && Number.isFinite(attempt.questionIndex) &&
      ['correct', 'incorrect', 'selfReview'].includes(attempt.result)) &&
    new Set(attempts.map((attempt) => attempt.id)).size === attempts.length;
}

/** Sample removal retains history without active cards. Merge those records without duplicating a repeated backup. */
function mergeOrphanHistory(backup: Store, problems: Problem[], study: StudyState[], attempts: Attempt[]): { ok: true } | Extract<SaveResult, { ok: false }> {
  const activeSourceIds = new Set(backup.problems.map(({ id }) => id));
  const orphanIds = new Set([...backup.study, ...backup.attempts].map(({ problemId }) => problemId)
    .filter((id) => !activeSourceIds.has(id)));
  const incomingStudy = normalizeStore(backup).study;
  const existingStudy = [...normalizeStore({ ...emptyStore(), study, attempts }).study];
  const sameRecords = (a: unknown[], b: unknown[]) => canonicalJson(a.map(canonicalJson).sort()) === canonicalJson(b.map(canonicalJson).sort());
  const overlappingHistory = (): Extract<SaveResult, { ok: false }> => ({ ok: false, code: 'conflict',
    reason: '削除済み問題の履歴が重なるため安全に結合できません。取り込みを中止しました。現在のデータは変更していません' });
  for (const sourceId of orphanIds) {
    const sourceStudy = incomingStudy.filter(({ problemId }) => problemId === sourceId);
    const sourceAttempts = backup.attempts.filter(({ problemId }) => problemId === sourceId);
    const namespace = `sample-history:${JSON.stringify(sourceId)}`;
    const isNamespace = (id: string) => id === namespace || id.startsWith(`${namespace}:`) &&
      /^[1-9]\d*$/.test(id.slice(namespace.length + 1));
    const project = (problemId: string, remapped: boolean) => ({
      mappedStudy: sourceStudy.map((state) => ({ ...state, problemId })),
      mappedAttempts: sourceAttempts.map((attempt) => ({ ...attempt, problemId,
        id: remapped ? `${problemId}:attempt:${JSON.stringify(attempt.id)}` : attempt.id })),
      previousStudy: existingStudy.filter((state) => state.problemId === problemId),
      previousAttempts: attempts.filter((attempt) => attempt.problemId === problemId),
    });
    const knownIds = new Set([...existingStudy, ...attempts].map(({ problemId }) => problemId)
      .filter((id) => id === sourceId || isNamespace(id)));
    const known = [...knownIds].map((id) => project(id, id !== sourceId));
    // Restore can reconnect the original event to a new problem ID while keeping its
    // event ID. Full payload equality (apart from that reference) identifies that group.
    const reconnectedIds = new Set(attempts.filter((existing) => sourceAttempts.some((attempt) =>
      attempt.id === existing.id && canonicalJson({ ...attempt, problemId: existing.problemId }) === canonicalJson(existing)))
      .map(({ problemId }) => problemId));
    known.push(...[...reconnectedIds].filter((id) => id !== sourceId).map((id) => project(id, false)));
    // Search every existing representation before considering an empty ID. A restored
    // active card or a now-free earlier collision slot must not duplicate known history.
    if (known.some(({ mappedStudy, mappedAttempts, previousStudy, previousAttempts }) =>
      sameRecords(previousStudy, mappedStudy) && sameRecords(previousAttempts, mappedAttempts))) continue;
    if (known.some(({ mappedStudy, previousStudy, mappedAttempts, previousAttempts }) => {
      if (mappedAttempts.some((attempt) => previousAttempts.some((existing) => existing.id === attempt.id))) return true;
      // Confirmations can be the entire history. Reusing a card ID does not prove
      // that a different state is independent, so do not duplicate ambiguous study.
      return mappedStudy.length > 0 && previousStudy.length > 0;
    })) return overlappingHistory();
    for (let suffix = 0; ; suffix++) {
      // Lossless source IDs plus collision probing avoid hashes and new import authority/schema fields.
      const problemId = suffix === 0 ? sourceId : `${namespace}${suffix === 1 ? '' : `:${suffix - 1}`}`;
      if (problems.some(({ id }) => id === problemId)) continue;
      const { mappedStudy, mappedAttempts, previousStudy, previousAttempts } = project(problemId, suffix !== 0);
      if (previousStudy.length || previousAttempts.length ||
        mappedAttempts.some((attempt) => attempts.some((existing) => existing.id === attempt.id))) continue;
      study.push(...mappedStudy);
      existingStudy.push(...mappedStudy);
      attempts.push(...mappedAttempts);
      break;
    }
  }
  return { ok: true };
}

export class LocalStorageRepository {
  private key: string;
  private memoryRevision: number | null = null;
  private onExternalChange: ((info: { revision: number }) => void) | null = null;

  constructor(key = STORAGE_KEY) {
    this.key = key;
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.handleStorage);
    }
  }

  dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.handleStorage);
    }
  }

  setExternalChangeHandler(handler: ((info: { revision: number }) => void) | null) {
    this.onExternalChange = handler;
    // React StrictMode can dispose and then resubscribe the same repository.
    if (handler && typeof window !== 'undefined') window.addEventListener('storage', this.handleStorage);
  }

  private handleStorage = (ev: StorageEvent) => {
    if (ev.key !== this.key || ev.newValue == null) return;
    try {
      const parsed = JSON.parse(ev.newValue) as Store;
      if (typeof parsed.revision === 'number' && parsed.revision !== this.memoryRevision) {
        this.onExternalChange?.({ revision: parsed.revision });
      }
    } catch {
      // ignore
    }
  };

  load(): LoadResult {
    let raw: string | null;
    try {
      raw = localStorage.getItem(this.key);
    } catch {
      return { ok: false, reason: 'localStorage にアクセスできません', code: 'access' };
    }
    if (raw == null) {
      const store = emptyStore();
      this.memoryRevision = store.revision;
      return { ok: true, store };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        reason: '保存データが破損しています。書き出して復旧してください',
        code: 'corrupt',
        raw,
      };
    }
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, reason: '保存データが不正です', code: 'corrupt', raw };
    }
    const schemaVersion = (parsed as { schemaVersion?: unknown }).schemaVersion;
    if (typeof schemaVersion === 'number' && schemaVersion > SCHEMA_VERSION) {
      return {
        ok: false,
        reason: `未知の上位スキーマ (v${schemaVersion}) です。自動初期化しません`,
        code: 'unknown_schema',
        raw,
      };
    }
    if (!isStoreShape(parsed)) {
      return {
        ok: false,
        reason: '保存データの形式が検証に失敗しました',
        code: 'corrupt',
        raw,
      };
    }
    const materialData = validateMaterialData(parsed);
    if (!materialData.ok) return { ok: false, reason: materialData.reason, code: 'corrupt', raw };
    const { ok: _ok, ...materialFields } = materialData;
    this.memoryRevision = parsed.revision;
    return { ok: true, store: normalizeStore({ ...parsed, ...materialFields }) };
  }

  private persist(store: Store, expectedRaw?: string | null): SaveResult {
    const materialData = validateMaterialData(store);
    if (!materialData.ok) return { ok: false, reason: materialData.reason, code: 'validation' };
    const { ok: _ok, ...materialFields } = materialData;
    if (this.memoryRevision !== null && store.revision !== this.memoryRevision + 1 && store.revision !== this.memoryRevision) {
      // caller should bump revision; we check against saved
    }
    const saved = this.readRawRevision();
    if (saved !== null && this.memoryRevision !== null && saved !== this.memoryRevision) {
      return {
        ok: false,
        reason: '別タブでデータが更新されています。再読込してください',
        code: 'conflict',
      };
    }

    const next: Store = { ...store, ...materialFields, revision: (this.memoryRevision ?? store.revision) + 1 };
    const text = JSON.stringify(next);
    const bytes = utf16Size(text);
    if (bytes > LIMITS.storageMaxBytes) {
      return {
        ok: false,
        reason: `保存サイズが上限(${LIMITS.storageMaxBytes}バイト)を超えます。画像削除やバックアップを検討してください`,
        code: 'size',
      };
    }
    try {
      if (expectedRaw !== undefined && localStorage.getItem(this.key) !== expectedRaw) {
        return { ok: false, code: 'conflict', reason: '別タブでデータが更新されています。再読込してください' };
      }
      localStorage.setItem(this.key, text);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        return {
          ok: false,
          reason: 'ブラウザの保存容量が不足しています。バックアップと画像削除を行ってください',
          code: 'quota',
        };
      }
      return { ok: false, reason: '保存に失敗しました', code: 'access' };
    }
    this.memoryRevision = next.revision;
    return { ok: true, store: next };
  }

  private readRawRevision(): number | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { revision?: number };
      return typeof parsed.revision === 'number' ? parsed.revision : null;
    } catch {
      return null;
    }
  }

  private sampleCatalogStorage() {
    return new SampleCatalogStorage(this.key, (store, expectedRaw) => {
      if (this.memoryRevision !== null && this.memoryRevision !== store.revision) {
        return { ok: false, code: 'conflict', reason: '保存後にデータが更新されています。再読込してください' };
      }
      const next: Store = { ...store, revision: store.revision + 1 };
      const text = JSON.stringify(next);
      if (utf16Size(text) > LIMITS.storageMaxBytes) {
        return { ok: false, code: 'size', reason: '保存サイズが上限を超えます。データは変更していません' };
      }
      try {
        // Recheck immediately before the single atomic main-store write. Snapshot writes never authorize overwriting newer work.
        if (localStorage.getItem(this.key) !== expectedRaw) {
          return { ok: false, code: 'conflict', reason: '別タブでデータが更新されています。再読込してください' };
        }
        localStorage.setItem(this.key, text);
      } catch (error) {
        const quota = error instanceof DOMException && ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(error.name);
        return { ok: false, code: quota ? 'quota' : 'access', reason: '保存に失敗しました。更新前バックアップは残しています' };
      }
      this.memoryRevision = next.revision;
      return { ok: true, store: next };
    });
  }

  updateSampleCatalog(store: Store, selectedIds: string[]): SaveResult {
    const materials = validateMaterialData(store);
    if (!materials.ok) return { ...materials, code: 'validation' };
    return this.sampleCatalogStorage().update(store, selectedIds);
  }

  removeSampleCatalog(store: Store, expectedIds: string[]): SaveResult {
    const materials = validateMaterialData(store);
    if (!materials.ok) return { ...materials, code: 'validation' };
    return this.sampleCatalogStorage().remove(store, expectedIds);
  }

  restoreSampleCatalog(store: Store, backupId: string): SampleRestoreResult {
    const materials = validateMaterialData(store);
    if (!materials.ok) return { ...materials, code: 'validation' };
    return this.sampleCatalogStorage().restore(store, backupId);
  }

  listSampleCatalogBackups() {
    return this.sampleCatalogStorage().list();
  }

  exportSampleCatalogSnapshot(backupId: string) {
    return this.sampleCatalogStorage().exportSnapshot(backupId);
  }

  replaceStore(store: Store): SaveResult {
    // force write with bump from memory
    const next = { ...store, schemaVersion: SCHEMA_VERSION as 1 };
    return this.persist(next);
  }

  /** Draft saves must not overwrite a stale in-memory store, even within one tab. */
  private checkCurrentWrite(store: Store): { ok: true; raw: string | null } | Extract<SaveResult, { ok: false }> {
    const conflict: Extract<SaveResult, { ok: false }> = {
      ok: false, code: 'conflict', reason: 'データが更新されています。再読込してから保存してください',
    };
    if (this.memoryRevision !== null && store.revision !== this.memoryRevision) return conflict;
    try {
      const raw = localStorage.getItem(this.key);
      if (raw === null) return store.revision === 0 ? { ok: true, raw } : conflict;
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return { ok: false, code: 'corrupt', reason: '保存データを読み取れません。データは変更していません' }; }
      if (!isStoreShape(parsed)) return { ok: false, code: 'corrupt', reason: '保存データの形式が不正です。データは変更していません' };
      const materialData = validateMaterialData(parsed);
      if (!materialData.ok) return { ok: false, code: 'corrupt', reason: materialData.reason };
      const { ok: _ok, ...materialFields } = materialData;
      if (canonicalJson(normalizeStore({ ...parsed, ...materialFields })) !== canonicalJson(normalizeStore(store))) return conflict;
      return { ok: true, raw };
    } catch {
      return { ok: false, code: 'access', reason: '保存データの読み取りに失敗しました。データは変更していません' };
    }
  }

  saveMaterial(store: Store, material: LearningMaterial): SaveResult {
    const checked = validateLearningMaterial(material);
    if (!checked.ok) return { ...checked, code: 'validation' };
    const current = this.checkCurrentWrite(store);
    if (!current.ok) return current;
    const materials = store.materials ?? [];
    const duplicate = materials.find((item) => item.id !== checked.material.id && item.url === checked.material.url);
    if (duplicate) return {
      ok: false, code: 'validation', reason: duplicate.archivedAt ? `このURLはアーカイブした「${duplicate.title}」に登録済みです。既存の教材を復元してください` : `このURLは「${duplicate.title}」に登録済みです`, duplicateMaterialId: duplicate.id,
    };
    const previous = materials.find((item) => item.id === checked.material.id);
    const now = nowIso();
    const saved: LearningMaterial = {
      ...checked.material, createdAt: previous?.createdAt ?? now, updatedAt: now,
    };
    // Content editors cannot implicitly archive or restore an existing material.
    if (previous?.archivedAt !== undefined) saved.archivedAt = previous.archivedAt;
    else delete saved.archivedAt;
    saved.sourceIds = previous ? materialSourceIds(previous) : materialSourceIds({ ...saved, sourceIds: undefined });
    return this.persist({ ...store, materials: previous
      ? materials.map((item) => item.id === saved.id ? saved : item)
      : [...materials, saved] }, current.raw);
  }

  setMaterialArchived(store: Store, materialId: string, archived: boolean): SaveResult {
    const current = this.checkCurrentWrite(store);
    if (!current.ok) return current;
    const material = store.materials?.find((item) => item.id === materialId);
    if (!material) return { ok: false, code: 'validation', reason: '教材が見つかりません' };
    if ((material.archivedAt !== undefined) === archived) return { ok: true, store };
    const now = nowIso();
    const saved = { ...material, updatedAt: now };
    if (archived) saved.archivedAt = now;
    else delete saved.archivedAt;
    return this.persist({ ...store, materials: store.materials!.map((item) => item.id === materialId ? saved : item) }, current.raw);
  }

  recordMaterialStudy(store: Store, materialId: string, comment: string, eventId: string): SaveResult {
    if (typeof eventId !== 'string' || !eventId.trim() || typeof comment !== 'string' || comment.length > MATERIAL_LIMITS.comment) {
      return { ok: false, code: 'validation', reason: `学習記録のIDまたはコメントが不正です。コメントは${MATERIAL_LIMITS.comment}文字以内で入力してください` };
    }
    const current = this.checkCurrentWrite(store);
    if (!current.ok) return current;
    const material = store.materials?.find((item) => item.id === materialId);
    if (!material) return { ok: false, code: 'validation', reason: '教材が見つかりません' };
    const events = store.materialStudyEvents ?? [];
    const existing = events.find((event) => event.id === eventId);
    if (existing) return existing.materialId === materialId && existing.comment === comment
      ? { ok: true, store }
      : { ok: false, code: 'validation', reason: 'この学習記録IDは別の記録に使用されています' };
    if (material.archivedAt !== undefined) return { ok: false, code: 'validation', reason: 'アーカイブした教材は復元してから学習を記録してください' };
    const at = nowIso();
    const event: MaterialStudyEvent = { id: eventId, materialId, at, title: material.title, url: material.url, comment };
    event.sourceIds = materialStudySourceIds(event);
    return this.persist({
      ...store,
      materials: store.materials!.map((item) => item.id === materialId ? { ...item, comment, updatedAt: at } : item),
      materialStudyEvents: [...events, event],
    }, current.raw);
  }

  undoMaterialStudy(store: Store, eventId: string): SaveResult {
    const current = this.checkCurrentWrite(store);
    if (!current.ok) return current;
    const events = store.materialStudyEvents ?? [];
    if (!events.some((event) => event.id === eventId)) return { ok: true, store };
    // The saved material comment is an editable note. Undo removes only this event, including after midnight.
    return this.persist({ ...store, materialStudyEvents: events.filter((event) => event.id !== eventId) }, current.raw);
  }

  saveProblem(store: Store, problem: Problem, isNew: boolean, inTest?: boolean): SaveResult {
    const current = this.checkCurrentWrite(store);
    if (!current.ok) return current;
    const issues = validateProblem(problem);
    if (hasErrors(issues)) {
      return {
        ok: false,
        reason: issues.filter((i) => i.level === 'error').map((i) => i.message).join(' / '),
        code: 'validation',
      };
    }

    let study = [...store.study];
    let problems: Problem[];

    if (isNew) {
      problems = [...store.problems, problem];
      study.push({
        problemId: problem.id,
        contentRevision: 0,
        confirmationCount: 0,
        lastConfirmedAt: null,
        understanding: 'unrated',
        lastReviewedAt: null,
        inTest: inTest ?? true,
      });
    } else {
      const prev = store.problems.find((p) => p.id === problem.id);
      if (!prev) {
        return { ok: false, reason: '問題が見つかりません', code: 'validation' };
      }
      // Editors need not know about catalog metadata; an edit keeps the original identity.
      problem = { ...problem };
      if (prev.sample !== undefined) problem.sample = structuredClone(prev.sample);
      else delete problem.sample;
      const bumped = isContentRevisionChange(prev, problem);
      problems = store.problems.map((p) => (p.id === problem.id ? problem : p));
      study = study.map((s) => {
        if (s.problemId !== problem.id) return s;
        const next = inTest === undefined ? s : { ...s, inTest };
        if (!bumped) return next;
        return {
          ...next,
          contentRevision: s.contentRevision + 1,
          understanding: 'unrated',
          lastReviewedAt: null,
        };
      });
      // 古いバックアップなどで学習状態が無い問題も、編集時の設定を同時に保存する。
      if (!study.some((s) => s.problemId === problem.id)) {
        study.push({
          problemId: problem.id,
          contentRevision: bumped ? 1 : 0,
          confirmationCount: 0,
          lastConfirmedAt: null,
          understanding: 'unrated',
          lastReviewedAt: null,
          inTest: inTest ?? true,
        });
      }
    }

    return this.persist({ ...store, problems, study }, current.raw);
  }

  deleteProblem(store: Store, problemId: string): SaveResult {
    return this.persist({
      ...store,
      problems: store.problems.filter((p) => p.id !== problemId),
      study: store.study.filter((s) => s.problemId !== problemId),
      attempts: store.attempts.filter((a) => a.problemId !== problemId),
    });
  }

  duplicateProblem(store: Store, problemId: string): SaveResult {
    const src = store.problems.find((p) => p.id === problemId);
    if (!src) return { ok: false, reason: '問題が見つかりません', code: 'validation' };
    const now = nowIso();
    const copy: Problem = {
      ...structuredClone(src),
      id: createId('prob'),
      createdAt: now,
      updatedAt: now,
      melds: src.melds.map((m) => ({ ...m, id: createId('meld') })),
      attachments: src.attachments.map((a) => ({ ...a, id: createId('att') })),
    };
    delete copy.sample;
    return this.saveProblem(store, copy, true);
  }

  confirmProblem(store: Store, problemId: string): SaveResult {
    const now = nowIso();
    const study = store.study.map((s) => {
      if (s.problemId !== problemId) return s;
      return {
        ...s,
        confirmationCount: s.confirmationCount + 1,
        lastConfirmedAt: now,
      };
    });
    const daily = bumpDaily(store.daily, dayKeyFromIso(now), 'confirmed', 1);
    return this.persist({ ...store, study, daily });
  }

  undoConfirm(store: Store, problemId: string, previous: StudyState): SaveResult {
    const study = store.study.map((s) => (s.problemId === problemId ? { ...previous } : s));
    const daily = bumpDaily(store.daily, dayKey(), 'confirmed', -1);
    return this.persist({ ...store, study, daily });
  }

  recordAttempt(store: Store, attempt: Attempt, understanding?: StudyState['understanding']): SaveResult {
    const attempts = [...store.attempts, attempt];
    const study = store.study.map((s) => {
      if (s.problemId !== attempt.problemId) return s;
      return {
        ...applyAttemptToStudy(s, attempt),
        understanding: understanding ?? s.understanding,
      };
    });
    const daily = bumpDaily(store.daily, dayKeyFromIso(attempt.at), 'tested', 1);
    return this.persist({ ...store, attempts, study, daily });
  }

  setInTest(store: Store, problemId: string, inTest: boolean): SaveResult {
    const study = store.study.map((s) => (s.problemId === problemId ? { ...s, inTest } : s));
    return this.persist({ ...store, study });
  }

  updateUnderstanding(
    store: Store,
    problemId: string,
    understanding: StudyState['understanding'],
  ): SaveResult {
    const now = nowIso();
    const study = store.study.map((s) =>
      s.problemId === problemId
        ? { ...s, understanding, lastReviewedAt: now }
        : s,
    );
    return this.persist({ ...store, study });
  }

  updateSettings(store: Store, settings: Settings): SaveResult {
    return this.persist({ ...store, settings });
  }

  upsertTag(store: Store, name: string): SaveResult | { ok: true; store: Store; tag: Tag } {
    const check = validateTagName(name, store.tags);
    if (!check.ok) return { ok: false, reason: check.reason, code: 'validation' };
    const capacity = canAddTag(store.tags.length, 0);
    if (!capacity.ok) return { ok: false, reason: capacity.reason, code: 'validation' };
    const tag: Tag = { id: createId('tag'), name: check.name };
    const result = this.persist({ ...store, tags: [...store.tags, tag] });
    if (!result.ok) return result;
    return { ok: true, store: result.store, tag };
  }

  renameTag(store: Store, tagId: string, name: string): SaveResult {
    const check = validateTagName(name, store.tags, tagId);
    if (!check.ok) return { ok: false, reason: check.reason, code: 'validation' };
    return this.persist({
      ...store,
      tags: store.tags.map((t) => (t.id === tagId ? { ...t, name: check.name } : t)),
    });
  }

  deleteTag(store: Store, tagId: string): SaveResult {
    return this.persist({
      ...store,
      tags: store.tags.filter((t) => t.id !== tagId),
      problems: store.problems.map((p) => ({
        ...p,
        tagIds: p.tagIds.filter((id) => id !== tagId),
      })),
    });
  }

  clearAll(): SaveResult {
    return this.sampleCatalogStorage().clear(this.memoryRevision);
  }

  exportJson(store: Store): string {
    return JSON.stringify(store, null, 2);
  }

  importJson(
    current: Store,
    jsonText: string,
    mode: 'merge' | 'replace',
  ): SaveResult {
    if (utf16Size(jsonText) / 2 > LIMITS.backupMaxBytes && jsonText.length > LIMITS.backupMaxBytes) {
      // backup max is 20MiB of file bytes roughly
    }
    if (new Blob([jsonText]).size > LIMITS.backupMaxBytes) {
      return { ok: false, reason: 'バックアップファイルが20MiBを超えています', code: 'size' };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return { ok: false, reason: 'JSONの解析に失敗しました', code: 'validation' };
    }
    if (!isStoreShape(parsed)) {
      return { ok: false, reason: 'バックアップの形式が不正です', code: 'validation' };
    }
    const materialData = validateMaterialData(parsed);
    if (!materialData.ok) return { ok: false, reason: materialData.reason, code: 'validation' };
    const { ok: _ok, ...materialFields } = materialData;
    const backup: Store = { ...parsed, ...materialFields };
    let expectedRaw: string | null | undefined;
    if (current.materials !== undefined || current.materialStudyEvents !== undefined ||
      backup.materials !== undefined || backup.materialStudyEvents !== undefined) {
      const before = this.checkCurrentWrite(current);
      if (!before.ok) return before;
      expectedRaw = before.raw;
    }

    if (mode === 'replace') {
      // Backup receipts describe local, already committed operations. Foreign or altered receipts cannot authorize an undo here.
      const incoming = validCatalogReceipts(backup.sampleCatalogUpdates) ? backup.sampleCatalogUpdates ?? [] : [];
      const local = validCatalogReceipts(current.sampleCatalogUpdates) ? current.sampleCatalogUpdates ?? [] : [];
      const sampleCatalogUpdates = local.filter((receipt) => incoming.some((entry) => canonicalJson(entry) === canonicalJson(receipt)));
      const replacement: Store = { ...backup, revision: current.revision, sampleCatalogUpdates };
      if (sampleCatalogUpdates.length === 0) delete replacement.sampleCatalogUpdates;
      return this.persist(normalizeStore(replacement), expectedRaw);
    }

    if (!validOrphanHistory(backup)) {
      return { ok: false, reason: '問題を削除済みの学習履歴が不正です。データは変更していません', code: 'validation' };
    }

    // merge: re-id problems/attempts, merge tags by name
    const tagIdMap = new Map<string, string>();
    const tags = [...current.tags];
    for (const t of backup.tags) {
      const key = normalizeTagKey(t.name);
      const existing = tags.find((x) => normalizeTagKey(x.name) === key);
      if (existing) {
        tagIdMap.set(t.id, existing.id);
      } else {
        if (tags.length >= LIMITS.tagsTotal) continue;
        const newId = createId('tag');
        tagIdMap.set(t.id, newId);
        tags.push({ id: newId, name: t.name.normalize('NFKC').trim() });
      }
    }

    const problemIdMap = new Map<string, string>();
    const problems = [...current.problems];
    const study = [...current.study];
    const attempts = [...current.attempts];
    const now = nowIso();

    for (const p of backup.problems) {
      const newId = createId('prob');
      problemIdMap.set(p.id, newId);
      problems.push({
        ...p,
        id: newId,
        tagIds: p.tagIds.map((id) => tagIdMap.get(id)).filter((x): x is string => !!x),
        melds: p.melds.map((m) => ({ ...m, id: createId('meld') })),
        attachments: p.attachments.map((a) => ({ ...a, id: createId('att') })),
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const s of backup.study) {
      const newPid = problemIdMap.get(s.problemId);
      if (!newPid) continue;
      study.push({ ...s, problemId: newPid });
    }
    for (const a of backup.attempts) {
      const newPid = problemIdMap.get(a.problemId);
      if (!newPid) continue;
      attempts.push({ ...a, id: createId('attm'), problemId: newPid });
    }

    const orphanHistory = mergeOrphanHistory(backup, problems, study, attempts);
    if (!orphanHistory.ok) return orphanHistory;

    const materials = [...(current.materials ?? [])];
    const materialIdMap = new Map<string, string>();
    for (const material of backup.materials ?? []) {
      const sources = materialSourceIds(material);
      const existing = materials.find((item) => materialSourceIds(item).some((source) => sources.includes(source))) ??
        materials.find((item) => item.url === material.url);
      if (existing) {
        // Keep current content and retain every imported identity, even when all its study events are undone.
        materialIdMap.set(material.id, existing.id);
        const index = materials.indexOf(existing);
        materials[index] = { ...existing, sourceIds: [...new Set([...materialSourceIds(existing), ...sources])] };
      } else {
        const id = materials.some((item) => item.id === material.id) ? createId('material') : material.id;
        materialIdMap.set(material.id, id);
        materials.push({ ...material, id, sourceIds: sources });
      }
    }
    const materialStudyEvents = [...(current.materialStudyEvents ?? [])];
    for (const event of backup.materialStudyEvents ?? []) {
      const sources = materialStudySourceIds(event);
      const mapped: MaterialStudyEvent = { ...event, materialId: materialIdMap.get(event.materialId)!, sourceIds: sources };
      const existing = materialStudyEvents.find((saved) => materialStudySourceIds(saved).some((source) => sources.includes(source)));
      if (existing) {
        if (existing.materialId !== mapped.materialId || !sameMaterialSnapshot(existing, mapped)) {
          return { ok: false, code: 'validation', reason: '同じ元データの学習記録に異なる内容が含まれています。データは変更していません' };
        }
        const index = materialStudyEvents.indexOf(existing);
        materialStudyEvents[index] = { ...existing, sourceIds: [...new Set([...materialStudySourceIds(existing), ...sources])] };
        continue;
      }
      // The source identity persists independently; a new local ID can never become another incoming event's identity.
      const id = materialStudyEvents.some((saved) => saved.id === mapped.id) ? createId('material-study') : mapped.id;
      materialStudyEvents.push({ ...mapped, id });
    }

    return this.persist({
      ...current,
      problems,
      tags,
      study,
      attempts,
      settings: current.settings,
      ...(current.materials !== undefined || backup.materials !== undefined ? { materials } : {}),
      ...(current.materialStudyEvents !== undefined || backup.materialStudyEvents !== undefined ? { materialStudyEvents } : {}),
    }, expectedRaw);
  }

  addFromShare(store: Store, payload: SharePayload): SaveResult {
    const now = nowIso();
    const tagIds: string[] = [];
    let tags = [...store.tags];
    if (payload.tags) {
      for (const name of payload.tags) {
        const key = normalizeTagKey(name);
        let existing = tags.find((t) => normalizeTagKey(t.name) === key);
        if (!existing) {
          const v = validateTagName(name, tags);
          if (!v.ok) continue;
          if (tags.length >= LIMITS.tagsTotal) continue;
          existing = { id: createId('tag'), name: v.name };
          tags = [...tags, existing];
        }
        if (tagIds.length < LIMITS.tagsPerProblem) tagIds.push(existing.id);
      }
    }

    const melds = [];
    for (const m of payload.melds) {
      const created = createMeld(m.type, m.tiles, m.from, m.calledIndex, m.addedIndex);
      if (!created.ok) {
        return { ok: false, reason: created.reason, code: 'validation' };
      }
      melds.push(created.meld);
    }

    const problem: Problem = {
      id: createId('prob'),
      title: payload.title,
      concealed: payload.concealed,
      drawn: payload.drawn,
      melds,
      doraIndicators: payload.doraIndicators,
      answerEnabled: payload.answerEnabled ?? false,
      acceptedDiscards: payload.acceptedDiscards ?? [],
      explanation: payload.explanation ?? '',
      privateMemo: '',
      tagIds,
      context: payload.context,
      attachments: [],
      sourceUrl: payload.sourceUrl ?? '',
      createdAt: now,
      updatedAt: now,
    };

    const issues = validateProblem(problem);
    if (hasErrors(issues)) {
      return {
        ok: false,
        reason: issues.filter((i) => i.level === 'error').map((i) => i.message).join(' / '),
        code: 'validation',
      };
    }

    return this.persist({
      ...store,
      tags,
      problems: [...store.problems, problem],
      study: [
        ...store.study,
        {
          problemId: problem.id,
          contentRevision: 0,
          confirmationCount: 0,
          lastConfirmedAt: null,
          understanding: 'unrated',
          lastReviewedAt: null,
        },
      ],
    });
  }

  addProblems(store: Store, problems: Problem[], tagName?: string): SaveResult {
    let tags = [...store.tags];
    let tagId: string | undefined;
    if (tagName) {
      const key = normalizeTagKey(tagName);
      const existing = tags.find((t) => normalizeTagKey(t.name) === key);
      if (existing) tagId = existing.id;
      else {
        const v = validateTagName(tagName, tags);
        if (v.ok && tags.length < LIMITS.tagsTotal) {
          tagId = createId('tag');
          tags = [...tags, { id: tagId, name: v.name }];
        }
      }
    }

    const now = nowIso();
    const nextProblems = [...store.problems];
    const nextStudy = [...store.study];
    for (const p of problems) {
      const id = createId('prob');
      const problem: Problem = {
        ...p,
        id,
        tagIds: tagId ? [tagId] : [...p.tagIds],
        createdAt: now,
        updatedAt: now,
      };
      const issues = validateProblem(problem);
      if (hasErrors(issues)) {
        return {
          ok: false,
          reason: issues.filter((i) => i.level === 'error').map((i) => i.message).join(' / '),
          code: 'validation',
        };
      }
      nextProblems.push(problem);
      nextStudy.push({
        problemId: id,
        contentRevision: 0,
        confirmationCount: 0,
        lastConfirmedAt: null,
        understanding: 'unrated',
        lastReviewedAt: null,
      });
    }
    return this.persist({
      ...store,
      tags,
      problems: nextProblems,
      study: nextStudy,
    });
  }
}
