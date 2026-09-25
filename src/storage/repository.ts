import {
  emptyStore,
  LIMITS,
  SCHEMA_VERSION,
  STORAGE_KEY,
  type Attempt,
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

export type SaveResult =
  | { ok: true; store: Store }
  | { ok: false; reason: string; code: 'quota' | 'conflict' | 'validation' | 'access' | 'corrupt' | 'size' };

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
    this.memoryRevision = parsed.revision;
    return { ok: true, store: parsed };
  }

  private persist(store: Store): SaveResult {
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

    const next: Store = { ...store, revision: (this.memoryRevision ?? store.revision) + 1 };
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

  replaceStore(store: Store): SaveResult {
    // force write with bump from memory
    const next = { ...store, schemaVersion: SCHEMA_VERSION as 1 };
    return this.persist(next);
  }

  saveProblem(store: Store, problem: Problem, isNew: boolean): SaveResult {
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
      });
    } else {
      const prev = store.problems.find((p) => p.id === problem.id);
      if (!prev) {
        return { ok: false, reason: '問題が見つかりません', code: 'validation' };
      }
      const bumped = isContentRevisionChange(prev, problem);
      problems = store.problems.map((p) => (p.id === problem.id ? problem : p));
      study = study.map((s) => {
        if (s.problemId !== problem.id) return s;
        if (!bumped) return s;
        return {
          ...s,
          contentRevision: s.contentRevision + 1,
          understanding: 'unrated',
          lastReviewedAt: null,
        };
      });
    }

    return this.persist({ ...store, problems, study });
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
    return this.persist({ ...store, study });
  }

  undoConfirm(store: Store, problemId: string, previous: StudyState): SaveResult {
    const study = store.study.map((s) => (s.problemId === problemId ? { ...previous } : s));
    return this.persist({ ...store, study });
  }

  recordAttempt(store: Store, attempt: Attempt, understanding?: StudyState['understanding']): SaveResult {
    const attempts = [...store.attempts, attempt];
    const study = store.study.map((s) => {
      if (s.problemId !== attempt.problemId) return s;
      return {
        ...s,
        understanding: understanding ?? s.understanding,
        lastReviewedAt: attempt.at,
      };
    });
    return this.persist({ ...store, attempts, study });
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
    return this.persist(emptyStore());
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

    if (mode === 'replace') {
      return this.persist({ ...parsed, revision: current.revision });
    }

    // merge: re-id problems/attempts, merge tags by name
    const tagIdMap = new Map<string, string>();
    const tags = [...current.tags];
    for (const t of parsed.tags) {
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

    for (const p of parsed.problems) {
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

    for (const s of parsed.study) {
      const newPid = problemIdMap.get(s.problemId);
      if (!newPid) continue;
      study.push({ ...s, problemId: newPid });
    }
    for (const a of parsed.attempts) {
      const newPid = problemIdMap.get(a.problemId);
      if (!newPid) continue;
      attempts.push({ ...a, id: createId('attm'), problemId: newPid });
    }

    return this.persist({
      ...current,
      problems,
      tags,
      study,
      attempts,
      settings: current.settings,
    });
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
