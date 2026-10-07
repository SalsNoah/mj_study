import { getSampleRemovalPreview, getSampleUpdatePreview, matchingCatalogTemplate, missingCatalogProblems } from '@/data/sampleCatalog';
import { canonicalJson, contentFingerprint, SAMPLE_TAG_NAME } from '@/data/sampleIdentity';
import { createId, nowIso } from '@/domain/ids';
import { normalizeStore } from '@/domain/records';
import { normalizeTagKey } from '@/domain/tags';
import { LIMITS, emptyStore, type Problem, type SampleCatalogReceipt, type Store, type StudyState } from '@/domain/types';
import { createInitialStore } from '@/data/initialMaterials';
import { hasErrors, validateProblem } from '@/domain/validate';
import type { SaveResult } from './repository';

type Failure = Extract<SaveResult, { ok: false }>;
type Result<T> = ({ ok: true } & T) | Failure;
export type SampleRestoreResult = Result<{ store: Store; preservedCopies: number }>;
export type SampleBackupSummary = {
  id: string;
  createdAt: string;
  restoredAt: string | null;
  removedCount: number;
  addedCount: number;
  state: 'applied' | 'restored' | 'unapplied';
};

type CatalogSnapshot = {
  format: 'mahjong-study-sample-backup';
  version: 1;
  id: string;
  createdAt: string;
  before: Store;
  removedIds: string[];
  addedProblems: Problem[];
  addedStudy: StudyState[];
  addedTags: Store['tags'];
};

type Commit = (store: Store, expectedRaw: string | null) => SaveResult;
const failure = (reason: string, code: Failure['code'] = 'validation'): Failure => ({ ok: false, reason, code });
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
/** Integrity check for accidental backup changes; this is not an authentication mechanism. */
function snapshotDigest(snapshot: CatalogSnapshot): string {
  const text = canonicalJson(snapshot);
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ text.charCodeAt(i), 0x85ebca6b);
  }
  return `v1:${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

const uniqueIds = (values: { id: string }[]) => values.every((value) => typeof value.id === 'string' && !!value.id) &&
  new Set(values.map((value) => value.id)).size === values.length;

export function validCatalogReceipts(value: unknown): value is SampleCatalogReceipt[] | undefined {
  if (value === undefined) return true;
  return Array.isArray(value) && value.every((item) => isRecord(item) &&
    typeof item.id === 'string' && /^sample-backup_[a-f0-9]{24}$/.test(item.id) &&
    typeof item.snapshotDigest === 'string' && /^v1:[a-f0-9]{16}$/.test(item.snapshotDigest) &&
    typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) &&
    (item.restoredAt === null || typeof item.restoredAt === 'string' && Number.isFinite(Date.parse(item.restoredAt)))) &&
    uniqueIds(value);
}

/** Reject unsafe input before taking a snapshot, without changing or repairing the user's data. */
function validStore(value: unknown): value is Store {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
    !Array.isArray(value.problems) || !Array.isArray(value.tags) || !Array.isArray(value.study) || !Array.isArray(value.attempts) ||
    !isRecord(value.settings) || typeof value.settings.autoSort !== 'boolean' || !validCatalogReceipts(value.sampleCatalogUpdates)) return false;
  try {
    const store = value as Store;
    if (!uniqueIds(store.problems) || !uniqueIds(store.tags) || !uniqueIds(store.attempts)) return false;
    if (!store.tags.every((tag) => typeof tag.name === 'string')) return false;
    if (!store.problems.every((problem) => typeof problem.createdAt === 'string' && typeof problem.updatedAt === 'string' &&
      !hasErrors(validateProblem(problem)) && problem.tagIds.every((id) => store.tags.some((tag) => tag.id === id)))) return false;
    if (new Set(store.study.map((state) => state.problemId)).size !== store.study.length) return false;
    if (!store.study.every((state) => typeof state.problemId === 'string' && Number.isFinite(state.confirmationCount) &&
      Number.isFinite(state.contentRevision))) return false;
    if (!store.attempts.every((attempt) => typeof attempt.problemId === 'string' && typeof attempt.at === 'string')) return false;
    if (store.daily !== undefined && (!isRecord(store.daily) || !Object.values(store.daily).every((day) =>
      isRecord(day) && Number.isFinite(day.tested) && Number.isFinite(day.confirmed)))) return false;
    return true;
  } catch { return false; }
}

function initialStudy(problemId: string): StudyState {
  return { problemId, contentRevision: 0, confirmationCount: 0, lastConfirmedAt: null,
    understanding: 'unrated', lastReviewedAt: null, lastSolvedAt: null, lastCorrectAt: null };
}

function sameStudy(a: StudyState, b: StudyState): boolean {
  return canonicalJson({ ...a, lastSolvedAt: a.lastSolvedAt ?? null, lastCorrectAt: a.lastCorrectAt ?? null }) ===
    canonicalJson({ ...b, lastSolvedAt: b.lastSolvedAt ?? null, lastCorrectAt: b.lastCorrectAt ?? null });
}

export class SampleCatalogStorage {
  private prefix: string;

  constructor(private key: string, private commit: Commit) {
    this.prefix = `${key}:sample-catalog-backup:`;
  }

  private readCurrent(): Result<{ store: Store; raw: string | null }> {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw === null) return { ok: true, store: createInitialStore(), raw };
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return failure('保存データを読み取れません。更新を中止しました', 'corrupt'); }
      if (!validStore(parsed)) return failure('保存データまたは更新履歴の形式が不正です。更新を中止しました', 'corrupt');
      return { ok: true, store: normalizeStore(parsed), raw };
    } catch { return failure('保存データの読み取りに失敗しました', 'access'); }
  }

  private currentMatches(store: Store): Result<{ raw: string | null }> {
    if (!validStore(store)) return failure('現在のデータの検証に失敗しました');
    const current = this.readCurrent();
    if (!current.ok) return current;
    if (canonicalJson(normalizeStore(store)) !== canonicalJson(current.store)) {
      return failure('別タブまたは読み込み後にデータが更新されています。再読込してください', 'conflict');
    }
    return { ok: true, raw: current.raw };
  }

  private readSnapshot(id: string): Result<{ snapshot: CatalogSnapshot }> {
    if (!/^sample-backup_[a-f0-9]{24}$/.test(id)) return failure('バックアップIDが不正です');
    let raw: string | null;
    try { raw = localStorage.getItem(this.prefix + id); }
    catch { return failure('バックアップを読み取れません', 'access'); }
    if (raw === null) return failure('更新前バックアップが見つかりません。データは変更していません', 'corrupt');
    try {
      const value: unknown = JSON.parse(raw);
      if (!isRecord(value) || value.format !== 'mahjong-study-sample-backup' || value.version !== 1 || value.id !== id ||
        typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || !validStore(value.before) ||
        !Array.isArray(value.removedIds) || !value.removedIds.every((entry) => typeof entry === 'string') ||
        new Set(value.removedIds).size !== value.removedIds.length || !Array.isArray(value.addedProblems) ||
        !Array.isArray(value.addedStudy) || !Array.isArray(value.addedTags)) throw new Error('invalid');
      const snapshot = value as CatalogSnapshot;
      if (!snapshot.removedIds.every((removedId) => snapshot.before.problems.some((problem) => problem.id === removedId)) ||
        !validStore({ ...emptyStore(), problems: snapshot.addedProblems, study: snapshot.addedStudy, tags: snapshot.addedTags }) ||
        snapshot.addedProblems.some((problem) => snapshot.before.problems.some((old) => old.id === problem.id)) ||
        snapshot.addedProblems.some((problem) => !snapshot.addedStudy.some((state) => state.problemId === problem.id))) throw new Error('invalid');
      return { ok: true, snapshot };
    } catch { return failure('更新前バックアップが破損しています。データは変更していません', 'corrupt'); }
  }

  private readAll(store: Store): Result<{ snapshots: CatalogSnapshot[] }> {
    if (!validCatalogReceipts(store.sampleCatalogUpdates)) return failure('サンプル更新履歴が不正です', 'corrupt');
    const snapshots: CatalogSnapshot[] = [];
    try {
      const keys: string[] = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(this.prefix)) keys.push(key);
      }
      for (const key of keys) {
        const result = this.readSnapshot(key.slice(this.prefix.length));
        if (!result.ok) return result;
        snapshots.push(result.snapshot);
      }
    } catch { return failure('バックアップ一覧を読み取れません', 'access'); }
    for (const receipt of store.sampleCatalogUpdates ?? []) {
      const snapshot = snapshots.find((entry) => entry.id === receipt.id);
      if (!snapshot || snapshot.createdAt !== receipt.createdAt || snapshotDigest(snapshot) !== receipt.snapshotDigest) return failure('更新履歴とバックアップが一致しません。データは変更していません', 'corrupt');
    }
    return { ok: true, snapshots };
  }

  list(): Result<{ backups: SampleBackupSummary[] }> {
    const current = this.readCurrent();
    if (!current.ok) return current;
    const all = this.readAll(current.store);
    if (!all.ok) return all;
    return { ok: true, backups: all.snapshots.map((snapshot) => {
      const receipt = current.store.sampleCatalogUpdates?.find((entry) => entry.id === snapshot.id);
      return { id: snapshot.id, createdAt: snapshot.createdAt, restoredAt: receipt?.restoredAt ?? null,
        removedCount: snapshot.removedIds.length, addedCount: snapshot.addedProblems.length,
        state: !receipt ? 'unapplied' as const : receipt.restoredAt ? 'restored' as const : 'applied' as const };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)) };
  }

  exportSnapshot(id: string): Result<{ text: string }> {
    const result = this.readSnapshot(id);
    if (!result.ok) return result;
    const current = this.readCurrent();
    if (!current.ok) return current;
    const receipt = current.store.sampleCatalogUpdates?.find((entry) => entry.id === id);
    if (receipt && (receipt.createdAt !== result.snapshot.createdAt || receipt.snapshotDigest !== snapshotDigest(result.snapshot))) {
      return failure('更新履歴とバックアップが一致しません。原本を確認できません', 'corrupt');
    }
    return { ok: true, text: JSON.stringify(result.snapshot.before, null, 2) };
  }

  update(store: Store, selectedIds: string[]): SaveResult {
    const current = this.currentMatches(store);
    if (!current.ok) return current;
    const previous = this.readAll(store);
    if (!previous.ok) return previous;
    const preview = getSampleUpdatePreview(store);
    if (!Array.isArray(selectedIds) || selectedIds.some((id) => !preview.candidates.some((candidate) => candidate.id === id))) {
      return failure('選択した旧問題が変更されたか見つかりません。内容を再確認してください', 'conflict');
    }
    const removedIds = [...new Set(selectedIds)];
    const additions = missingCatalogProblems(store);
    if (removedIds.length === 0 && additions.length === 0) return { ok: true, store };
    const tags = [...store.tags];
    let tag = tags.find((entry) => normalizeTagKey(entry.name) === normalizeTagKey(SAMPLE_TAG_NAME));
    if (additions.length && !tag) {
      if (tags.length >= LIMITS.tagsTotal) return failure('サンプルタグを追加する空きがありません');
      tag = { id: createId('tag'), name: SAMPLE_TAG_NAME };
      tags.push(tag);
    }
    const addedProblems = additions.map((problem) => ({ ...problem, tagIds: [tag!.id] }));
    const addedStudy = addedProblems.map((problem) => initialStudy(problem.id));
    return this.applyChange(store, current.raw, removedIds, addedProblems, addedStudy, tags);
  }

  remove(store: Store, expectedIds: string[]): SaveResult {
    const current = this.currentMatches(store);
    if (!current.ok) return current;
    const previous = this.readAll(store);
    if (!previous.ok) return previous;
    const removedIds = getSampleRemovalPreview(store).candidates.map(({ id }) => id);
    if (!Array.isArray(expectedIds) || expectedIds.length !== removedIds.length ||
      new Set(expectedIds).size !== expectedIds.length || removedIds.some((id) => !expectedIds.includes(id))) {
      return failure('削除対象が変わりました。件数と問題名を再確認してください', 'conflict');
    }
    if (removedIds.length === 0) return { ok: true, store };
    return this.applyChange(store, current.raw, removedIds, [], [], store.tags, true);
  }

  private applyChange(store: Store, originalRaw: string | null, removedIds: string[],
    addedProblems: Problem[], addedStudy: StudyState[], tags: Store['tags'], retainHistory = false): SaveResult {
    const id = createId('sample-backup');
    const createdAt = nowIso();
    const snapshot: CatalogSnapshot = { format: 'mahjong-study-sample-backup', version: 1, id, createdAt,
      before: originalRaw === null ? createInitialStore() : JSON.parse(originalRaw) as Store, removedIds, addedProblems, addedStudy, addedTags: tags };
    const removed = new Set(removedIds);
    const next: Store = { ...store, tags,
      problems: [...store.problems.filter((problem) => !removed.has(problem.id)), ...addedProblems],
      // Removing a sample from the library must not erase its learning or change accuracy/totals.
      // Orphan records are supported by load, normalization, JSON backup and selective restore.
      study: [...(retainHistory ? store.study : store.study.filter((state) => !removed.has(state.problemId))), ...addedStudy],
      attempts: retainHistory ? store.attempts : store.attempts.filter((attempt) => !removed.has(attempt.problemId)),
      sampleCatalogUpdates: [...(store.sampleCatalogUpdates ?? []), { id, createdAt, restoredAt: null, snapshotDigest: snapshotDigest(snapshot) }] };
    if (!validStore(next)) return failure('更新後のデータの検証に失敗しました');
    if (JSON.stringify({ ...next, revision: store.revision + 1 }).length * 2 > LIMITS.storageMaxBytes) {
      return failure('更新後の保存サイズが上限を超えます', 'size');
    }
    const backupKey = this.prefix + id;
    const text = JSON.stringify(snapshot);
    try {
      if (localStorage.getItem(backupKey) !== null) return failure('バックアップIDが競合しました。再実行してください', 'conflict');
      localStorage.setItem(backupKey, text);
      // A failed readback never reaches the main write. The uncommitted snapshot is retained.
      if (localStorage.getItem(backupKey) !== text) return failure('更新前バックアップの書き込み確認に失敗しました', 'corrupt');
    } catch (error) {
      return failure('更新前バックアップを保存・確認できません。データは変更していません',
        error instanceof DOMException && ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(error.name) ? 'quota' : 'access');
    }
    return this.commit(next, originalRaw);
  }

  /** Called only by the explicit, confirmed “delete all data” action. */
  clear(expectedRevision: number | null): SaveResult {
    let mainRaw: string | null;
    const originals = new Map<string, string>();
    let revision = 0;
    const namespaceKeys = () => {
      const keys = new Set<string>();
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(this.prefix)) keys.add(key);
      }
      return [...keys];
    };
    try {
      mainRaw = localStorage.getItem(this.key);
      if (mainRaw !== null) {
        try {
          const parsed: unknown = JSON.parse(mainRaw);
          if (isRecord(parsed) && Number.isSafeInteger(parsed.revision) && (parsed.revision as number) >= 0) revision = parsed.revision as number;
          else if (expectedRevision !== null) return failure('保存データの状態が変わっています。再読込してから削除してください', 'conflict');
        } catch {
          if (expectedRevision !== null) return failure('保存データの状態が変わっています。再読込してから削除してください', 'conflict');
          // Explicit deletion also supports recovery from an initially corrupt main store.
        }
      }
      if (expectedRevision !== null && revision !== expectedRevision) return failure('別タブでデータが更新されています。再読込してから削除してください', 'conflict');
      for (const key of namespaceKeys()) {
        const raw = localStorage.getItem(key);
        if (raw === null) return failure('バックアップ一覧が変わりました。再読込してから削除してください', 'conflict');
        originals.set(key, raw);
      }
      if (localStorage.getItem(this.key) !== mainRaw) return failure('別タブでデータが更新されています。再読込してから削除してください', 'conflict');
    } catch { return failure('削除対象データを読み取れません。削除は開始していません', 'access'); }

    const touched: string[] = [];
    const recover = (result: Failure): Failure => {
      let complete = true;
      // Keep the main store intact until deletion succeeds. If a later step fails, restore snapshots where safe.
      for (const key of touched) {
        try {
          const original = originals.get(key)!;
          const current = localStorage.getItem(key);
          if (current === original) continue;
          if (current !== null) { complete = false; continue; }
          localStorage.setItem(key, original);
          if (localStorage.getItem(key) !== original) complete = false;
        } catch { complete = false; }
      }
      return { ...result, reason: `${result.reason}。全削除は完了していません。${complete
        ? '問題データは削除していません。更新前バックアップの削除は取り消しました'
        : '一部の更新前バックアップを元に戻せませんでした。問題データは残しています。再読込して状態を確認してください'}` };
    };
    try {
      for (const [key, raw] of originals) {
        if (localStorage.getItem(key) !== raw) return recover(failure('バックアップが変更されました', 'conflict'));
        touched.push(key);
        localStorage.removeItem(key);
        if (localStorage.getItem(key) !== null) return recover(failure('更新前バックアップの削除を確認できません', 'access'));
      }
      if (namespaceKeys().length !== 0) return recover(failure('新しいバックアップが作成されました', 'conflict'));
    } catch { return recover(failure('更新前バックアップの削除に失敗しました', 'access')); }
    const cleared = this.commit({ ...emptyStore(), revision }, mainRaw);
    return cleared.ok ? cleared : recover({ ...cleared, reason: cleared.code === 'conflict' ? '別タブでデータが更新されたため削除を中止しました' : '問題データの削除保存に失敗しました' });
  }

  restore(store: Store, id: string): SampleRestoreResult {
    const current = this.currentMatches(store);
    if (!current.ok) return current;
    const all = this.readAll(store);
    if (!all.ok) return all;
    const snapshot = all.snapshots.find((entry) => entry.id === id);
    const receipt = store.sampleCatalogUpdates?.find((entry) => entry.id === id);
    if (!snapshot || !receipt) return failure('適用済みの更新とバックアップを確認できません。データは変更していません', 'corrupt');
    if (receipt.restoredAt) return { ok: true, store, preservedCopies: 0 };
    const removable = new Set(snapshot.addedProblems.filter((original) => {
      const problem = store.problems.find((entry) => entry.id === original.id);
      const states = store.study.filter((state) => state.problemId === original.id);
      const baseline = snapshot.addedStudy.find((state) => state.problemId === original.id);
      return problem && canonicalJson(problem) === canonicalJson(original) &&
        contentFingerprint(problem, store.tags) === contentFingerprint(original, snapshot.addedTags) &&
        states.length === 1 && baseline && sameStudy(states[0]!, baseline) &&
        !store.attempts.some((attempt) => attempt.problemId === original.id);
    }).map((problem) => problem.id));
    const preservedCopies = new Set<string>();
    const retainedOriginalIds = new Set<string>();
    if (snapshot.addedProblems.length === 0) {
      // Only undo a removal of recognized originals. A later untouched, unstudied re-add
      // can give way to the original card/history; edits or learning always keep their copy.
      for (const original of snapshot.before.problems.filter((problem) => snapshot.removedIds.includes(problem.id))) {
        const template = matchingCatalogTemplate(original);
        if (!template || contentFingerprint(original, snapshot.before.tags) !== template.sample!.fingerprint) continue;
        retainedOriginalIds.add(original.id);
        for (const candidate of store.problems) {
          if (snapshot.before.problems.some((problem) => problem.id === candidate.id) ||
            !matchingCatalogTemplate(candidate, [template])) continue;
          const states = store.study.filter((state) => state.problemId === candidate.id);
          if (contentFingerprint(candidate, store.tags) === template.sample!.fingerprint &&
            states.length === 1 && sameStudy(states[0]!, initialStudy(candidate.id)) &&
            !store.attempts.some((attempt) => attempt.problemId === candidate.id)) removable.add(candidate.id);
          else preservedCopies.add(candidate.id);
        }
      }
    }
    const problems = store.problems.filter((problem) => !removable.has(problem.id));
    const study = store.study.filter((state) => !removable.has(state.problemId));
    const attempts = [...store.attempts];
    const tags = [...store.tags];
    const tagMap = new Map<string, string>();
    const problemMap = new Map<string, string>();
    for (const original of snapshot.before.problems.filter((problem) => snapshot.removedIds.includes(problem.id))) {
      const tagIds: string[] = [];
      for (const oldTagId of original.tagIds) {
        let mapped = tagMap.get(oldTagId);
        if (!mapped) {
          const oldTag = snapshot.before.tags.find((entry) => entry.id === oldTagId)!;
          let tag = tags.find((entry) => normalizeTagKey(entry.name) === normalizeTagKey(oldTag.name));
          if (!tag) {
            if (tags.length >= LIMITS.tagsTotal) return failure('復元に必要なタグの空きがありません。データは変更していません');
            tag = { ...oldTag, id: tags.some((entry) => entry.id === oldTagId) ? createId('tag') : oldTagId };
            tags.push(tag);
          }
          mapped = tag.id;
          tagMap.set(oldTagId, mapped);
        }
        tagIds.push(mapped);
      }
      let restored = { ...structuredClone(original), tagIds };
      const existing = problems.find((problem) => problem.id === original.id);
      if (existing && canonicalJson(existing) !== canonicalJson(restored)) restored = { ...restored, id: createId('prob') };
      if (restored.id !== original.id && retainedOriginalIds.has(original.id)) {
        const originalState = normalizeStore(snapshot.before).study.find((state) => state.problemId === original.id);
        if (originalState) {
          const retained = study.filter((state) => state.problemId === original.id);
          const laterAttempts = attempts.some((attempt) => attempt.problemId === original.id &&
            !snapshot.before.attempts.some((entry) => canonicalJson(entry) === canonicalJson(attempt)));
          if (retained.length > 1 || retained.length === 1 && !sameStudy(retained[0]!, originalState) || laterAttempts) {
            return failure('再使用された問題IDの学習状態を安全に分けられません。復元を中止しました。データは変更していません', 'conflict');
          }
          // The unchanged state still belongs to the removed original. Reconnect it;
          // the unrelated card must not inherit its confirmations or understanding.
          if (retained[0]) study[study.indexOf(retained[0])] = { ...retained[0], problemId: restored.id };
          else study.push({ ...originalState, problemId: restored.id });
          study.push(initialStudy(original.id));
        }
      }
      if (!existing || restored.id !== existing.id) problems.push(restored);
      problemMap.set(original.id, restored.id);
      for (const state of snapshot.before.study.filter((entry) => entry.problemId === original.id)) {
        if (!study.some((entry) => entry.problemId === restored.id)) study.push({ ...state, problemId: restored.id });
      }
    }
    for (const original of snapshot.before.attempts) {
      const problemId = problemMap.get(original.problemId);
      if (!problemId) continue;
      const restored = { ...original, problemId };
      const existing = attempts.find((attempt) => attempt.id === original.id);
      if (!existing) attempts.push(restored);
      else if (retainedOriginalIds.has(original.problemId) && canonicalJson(existing) === canonicalJson(original)) {
        // This exact event survived sample removal. If its old problem ID was reused,
        // reconnect it to the restored original rather than counting the event twice.
        attempts[attempts.indexOf(existing)] = restored;
      }
      else if (canonicalJson(existing) !== canonicalJson(restored)) attempts.push({ ...restored, id: createId('attm') });
    }
    const next = { ...store, problems, tags, study, attempts,
      // Daily totals were never subtracted during update, and later totals must remain intact.
      sampleCatalogUpdates: store.sampleCatalogUpdates!.map((entry) => entry.id === id ? { ...entry, restoredAt: nowIso() } : entry) };
    if (!validStore(next)) return failure('復元後のデータの検証に失敗しました。データは変更していません');
    const result = this.commit(next, current.raw);
    return result.ok ? { ...result, preservedCopies: preservedCopies.size } : result;
  }
}
