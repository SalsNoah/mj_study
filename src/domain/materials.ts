import type { LearningMaterial, MaterialStudyEvent } from './types';

export const MATERIAL_LIMITS = { title: 100, url: 2048, comment: 4000 } as const;

type ValidationFailure = { ok: false; reason: string };
export type MaterialUrlResult = { ok: true; url: string } | ValidationFailure;

/** Parse locally only. Preserve paths, query order and fragments (including video positions). */
export function normalizeMaterialUrl(input: string): MaterialUrlResult {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, reason: '教材のURLを入力してください' };
  const value = input.trim();
  if (value.length > MATERIAL_LIMITS.url) return { ok: false, reason: `URLは${MATERIAL_LIMITS.url}文字以内で入力してください` };
  if (!/^https?:\/\/[^/?#]+(?:[/?#]|$)/i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) {
    return { ok: false, reason: 'http:// または https:// で始まる有効なURLを入力してください' };
  }
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('protocol');
    if (parsed.username || parsed.password || value.split(/[/?#]/)[2]?.includes('@')) {
      return { ok: false, reason: 'ユーザー名やパスワードを含むURLは登録できません' };
    }
    const url = parsed.href;
    if (url.length > MATERIAL_LIMITS.url) return { ok: false, reason: `URLは${MATERIAL_LIMITS.url}文字以内で入力してください` };
    return { ok: true, url };
  } catch {
    return { ok: false, reason: '有効なURLを入力してください' };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const validTitle = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MATERIAL_LIMITS.title;
const validComment = (value: unknown): value is string => typeof value === 'string' && value.length <= MATERIAL_LIMITS.comment;
const validSourceIds = (value: unknown): value is string[] | undefined => value === undefined ||
  Array.isArray(value) && value.length > 0 && value.every(validId) && new Set(value).size === value.length;

/** Legacy backups have no provenance. Capture a lossless identity once, before any ID or URL changes. */
export function materialSourceIds(material: LearningMaterial): string[] {
  return material.sourceIds ?? [JSON.stringify(['material-v1', material.id, material.createdAt, material.url])];
}

export function materialStudySourceIds(event: MaterialStudyEvent): string[] {
  return event.sourceIds ?? [JSON.stringify([
    'material-study-v1', event.id, event.materialId, event.at, event.title, event.url, event.comment,
  ])];
}

/** Require an unambiguous ISO instant, including a timezone, and a real calendar day. */
function validInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hours, minutes, seconds] = match;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= daysInMonth &&
    Number(hours) < 24 && Number(minutes) < 60 && Number(seconds) < 60;
}

export function validateLearningMaterial(value: unknown): { ok: true; material: LearningMaterial } | ValidationFailure {
  if (!isRecord(value) || !validId(value.id)) return { ok: false, reason: '教材のIDが不正です' };
  if (!validTitle(value.title)) return { ok: false, reason: `教材名を1〜${MATERIAL_LIMITS.title}文字で入力してください` };
  const url = normalizeMaterialUrl(value.url as string);
  if (!url.ok) return url;
  if (!validComment(value.comment)) return { ok: false, reason: `コメントは${MATERIAL_LIMITS.comment}文字以内で入力してください` };
  if (!validInstant(value.createdAt) || !validInstant(value.updatedAt)) return { ok: false, reason: '教材の保存日時が不正です' };
  if (!validSourceIds(value.sourceIds)) return { ok: false, reason: '教材の元データ識別情報が不正です' };
  return { ok: true, material: {
    id: value.id, title: value.title.trim(), url: url.url, comment: value.comment,
    createdAt: value.createdAt, updatedAt: value.updatedAt,
    ...(value.sourceIds !== undefined ? { sourceIds: [...value.sourceIds] } : {}),
  } };
}

type MaterialFields = { materials?: LearningMaterial[]; materialStudyEvents?: MaterialStudyEvent[] };
export type MaterialDataResult = ({ ok: true } & MaterialFields) | ValidationFailure;

/** Optional schema-one fields are validated together, before a load/import/write can use them. */
export function validateMaterialData(value: { materials?: unknown; materialStudyEvents?: unknown }): MaterialDataResult {
  const result: { ok: true } & MaterialFields = { ok: true };
  const materialIds = new Set<string>();
  const urls = new Set<string>();
  const materialSources = new Set<string>();
  if (value.materials !== undefined) {
    if (!Array.isArray(value.materials)) return { ok: false, reason: '教材一覧の形式が不正です' };
    result.materials = [];
    for (const item of value.materials) {
      const parsed = validateLearningMaterial(item);
      if (!parsed.ok) return parsed;
      const material = parsed.material;
      if (materialIds.has(material.id) || urls.has(material.url)) return { ok: false, reason: '教材のIDまたはURLが重複しています' };
      for (const source of materialSourceIds(material)) {
        if (materialSources.has(source)) return { ok: false, reason: '教材の元データ識別情報が重複しています' };
        materialSources.add(source);
      }
      materialIds.add(material.id);
      urls.add(material.url);
      result.materials.push(material);
    }
  }
  if (value.materialStudyEvents !== undefined) {
    if (!Array.isArray(value.materialStudyEvents)) return { ok: false, reason: '教材の学習履歴の形式が不正です' };
    result.materialStudyEvents = [];
    const eventIds = new Set<string>();
    const eventSources = new Set<string>();
    for (const event of value.materialStudyEvents) {
      if (!isRecord(event) || !validId(event.id) || !validId(event.materialId) ||
        !materialIds.has(event.materialId) || eventIds.has(event.id) || !validInstant(event.at) ||
        !validTitle(event.title) || !validComment(event.comment) || !validSourceIds(event.sourceIds)) {
        return { ok: false, reason: '教材の学習履歴の内容・参照先・IDが不正です' };
      }
      const url = normalizeMaterialUrl(event.url as string);
      if (!url.ok) return url;
      eventIds.add(event.id);
      const normalized: MaterialStudyEvent = {
        id: event.id, materialId: event.materialId, at: event.at,
        title: event.title.trim(), url: url.url, comment: event.comment,
        ...(event.sourceIds !== undefined ? { sourceIds: [...event.sourceIds] } : {}),
      };
      for (const source of materialStudySourceIds(normalized)) {
        if (eventSources.has(source)) return { ok: false, reason: '教材学習記録の元データ識別情報が重複しています' };
        eventSources.add(source);
      }
      result.materialStudyEvents.push(normalized);
    }
  }
  return result;
}

/** Shared by counts, charts and history so each event has one contribution everywhere. */
export function uniqueMaterialStudyEvents(events: readonly MaterialStudyEvent[] | undefined): MaterialStudyEvent[] {
  const ids = new Set<string>();
  return (events ?? []).filter((event) => {
    if (ids.has(event.id)) return false;
    ids.add(event.id);
    return true;
  });
}

export function countMaterialStudies(events: readonly MaterialStudyEvent[] | undefined, materialId?: string): number {
  return uniqueMaterialStudyEvents(events).filter((event) => materialId === undefined || event.materialId === materialId).length;
}
