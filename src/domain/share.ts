import { inflateSync, deflateSync, strToU8, strFromU8 } from 'fflate';
import type {
  Meld,
  Problem,
  ProblemContext,
  TileCode,
} from './types';
import { LIMITS } from './types';
import { isTileCode } from './tiles';
import { validateMeldShape } from './melds';

export const SHARE_FORMAT_VERSION = 1 as const;

export type ShareOptions = {
  includeAnswerAndExplanation: boolean;
  includeTags: boolean;
  includeSourceUrl: boolean;
};

export const DEFAULT_SHARE_OPTIONS: ShareOptions = {
  includeAnswerAndExplanation: true,
  includeTags: false,
  includeSourceUrl: false,
};

/** 共有ペイロード（許可フィールドのみ） */
export type SharePayload = {
  v: typeof SHARE_FORMAT_VERSION;
  title: string;
  concealed: TileCode[];
  drawn: TileCode | null;
  melds: Array<{
    type: Meld['type'];
    tiles: TileCode[];
    from: Meld['from'];
    calledIndex: number | null;
    addedIndex: number | null;
  }>;
  doraIndicators: TileCode[];
  context: ProblemContext;
  answerEnabled?: boolean;
  acceptedDiscards?: TileCode[];
  explanation?: string;
  tags?: string[];
  sourceUrl?: string;
};

export function extractSharePayload(
  problem: Problem,
  tagNames: string[],
  options: ShareOptions,
): SharePayload {
  const payload: SharePayload = {
    v: SHARE_FORMAT_VERSION,
    title: problem.title,
    concealed: [...problem.concealed],
    drawn: problem.drawn,
    melds: problem.melds.map((m) => ({
      type: m.type,
      tiles: [...m.tiles],
      from: m.from,
      calledIndex: m.calledIndex,
      addedIndex: m.addedIndex,
    })),
    doraIndicators: [...problem.doraIndicators],
    context: structuredClone(problem.context),
  };

  if (options.includeAnswerAndExplanation) {
    payload.answerEnabled = problem.answerEnabled;
    payload.acceptedDiscards = [...problem.acceptedDiscards];
    payload.explanation = problem.explanation;
  }
  if (options.includeTags) {
    payload.tags = [...tagNames];
  }
  if (options.includeSourceUrl && problem.sourceUrl) {
    payload.sourceUrl = problem.sourceUrl;
  }

  return payload;
}

function bytesToUrlSafe(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function urlSafeToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeSharePayload(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  const compressed = deflateSync(strToU8(json), { level: 9 });
  return `v1.${bytesToUrlSafe(compressed)}`;
}

export type DecodeError = { ok: false; reason: string };
export type DecodeOk = { ok: true; payload: SharePayload };

export function decodeSharePayload(encoded: string): DecodeOk | DecodeError {
  if (!encoded.startsWith('v1.')) {
    return { ok: false, reason: '未知の共有形式です' };
  }
  const body = encoded.slice(3);
  if (!body) return { ok: false, reason: '共有データが空です' };

  let bytes: Uint8Array;
  try {
    bytes = urlSafeToBytes(body);
  } catch {
    return { ok: false, reason: '共有データの形式が不正です' };
  }

  // 展開後上限を守るため、展開結果サイズを制限
  let json: string;
  try {
    // 展開サイズ制限: 失敗時は例外。追加で文字列長も検証する
    const inflated = inflateSync(bytes);
    json = strFromU8(inflated);
  } catch {
    return { ok: false, reason: '共有データの展開に失敗しました（破損または上限超過）' };
  }

  if (json.length > LIMITS.shareJsonMaxBytes) {
    return { ok: false, reason: '共有データが大きすぎます' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, reason: '共有JSONの解析に失敗しました' };
  }

  const validated = validateSharePayload(raw);
  if (!validated.ok) return validated;
  return { ok: true, payload: validated.payload };
}

function isWind(v: unknown): v is ProblemContext['roundWind'] {
  return v === null || v === '1z' || v === '2z' || v === '3z' || v === '4z';
}

function validateSharePayload(
  raw: unknown,
): { ok: true; payload: SharePayload } | DecodeError {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: '共有データがオブジェクトではありません' };
  }
  const o = raw as Record<string, unknown>;
  if (o.v !== SHARE_FORMAT_VERSION) {
    return { ok: false, reason: '未知の共有形式バージョンです' };
  }
  if (typeof o.title !== 'string' || o.title.length > LIMITS.title) {
    return { ok: false, reason: 'タイトルが不正です' };
  }
  if (!Array.isArray(o.concealed) || !o.concealed.every((t) => typeof t === 'string' && isTileCode(t))) {
    return { ok: false, reason: '手牌が不正です' };
  }
  if (!(o.drawn === null || (typeof o.drawn === 'string' && isTileCode(o.drawn)))) {
    return { ok: false, reason: 'ツモ牌が不正です' };
  }
  if (!Array.isArray(o.doraIndicators) || !o.doraIndicators.every((t) => typeof t === 'string' && isTileCode(t))) {
    return { ok: false, reason: 'ドラ表示牌が不正です' };
  }
  if (!Array.isArray(o.melds)) {
    return { ok: false, reason: '副露が不正です' };
  }

  const melds: SharePayload['melds'] = [];
  for (const m of o.melds) {
    if (!m || typeof m !== 'object') return { ok: false, reason: '副露が不正です' };
    const mm = m as Record<string, unknown>;
    const type = mm.type;
    if (
      type !== 'chi' &&
      type !== 'pon' &&
      type !== 'openKan' &&
      type !== 'closedKan' &&
      type !== 'addedKan'
    ) {
      return { ok: false, reason: '副露種類が不正です' };
    }
    if (!Array.isArray(mm.tiles) || !mm.tiles.every((t) => typeof t === 'string' && isTileCode(t))) {
      return { ok: false, reason: '副露の牌が不正です' };
    }
    const from =
      mm.from === null ||
      mm.from === 'left' ||
      mm.from === 'opposite' ||
      mm.from === 'right'
        ? (mm.from as Meld['from'])
        : null;
    if (mm.from !== undefined && mm.from !== null && from === null && mm.from !== null) {
      // handled below
    }
    if (
      mm.from !== null &&
      mm.from !== 'left' &&
      mm.from !== 'opposite' &&
      mm.from !== 'right'
    ) {
      return { ok: false, reason: '副露の取得元が不正です' };
    }
    const calledIndex =
      mm.calledIndex === null || typeof mm.calledIndex === 'number'
        ? (mm.calledIndex as number | null)
        : undefined;
    const addedIndex =
      mm.addedIndex === null || typeof mm.addedIndex === 'number'
        ? (mm.addedIndex as number | null)
        : undefined;
    if (calledIndex === undefined || addedIndex === undefined) {
      return { ok: false, reason: '副露の位置が不正です' };
    }
    const check = validateMeldShape(
      type,
      mm.tiles as TileCode[],
      mm.from as Meld['from'],
      calledIndex,
      addedIndex,
    );
    if (!check.ok) return { ok: false, reason: check.reason };
    melds.push({
      type,
      tiles: mm.tiles as TileCode[],
      from: mm.from as Meld['from'],
      calledIndex,
      addedIndex,
    });
  }

  if (!o.context || typeof o.context !== 'object') {
    return { ok: false, reason: '対局条件が不正です' };
  }
  const ctx = o.context as Record<string, unknown>;
  if (!isWind(ctx.roundWind) || !isWind(ctx.seatWind)) {
    return { ok: false, reason: '風が不正です' };
  }

  const payload: SharePayload = {
    v: SHARE_FORMAT_VERSION,
    title: o.title,
    concealed: o.concealed as TileCode[],
    drawn: o.drawn as TileCode | null,
    melds,
    doraIndicators: o.doraIndicators as TileCode[],
    context: o.context as ProblemContext,
  };

  // オプションフィールド：無いなら含めない（正解OFF）
  if ('answerEnabled' in o || 'acceptedDiscards' in o || 'explanation' in o) {
    if (typeof o.answerEnabled !== 'boolean') {
      return { ok: false, reason: '正解設定が不正です' };
    }
    if (
      !Array.isArray(o.acceptedDiscards) ||
      !o.acceptedDiscards.every((t) => typeof t === 'string' && isTileCode(t))
    ) {
      return { ok: false, reason: '正解牌が不正です' };
    }
    if (typeof o.explanation !== 'string' || o.explanation.length > LIMITS.explanation) {
      return { ok: false, reason: '解説が不正です' };
    }
    payload.answerEnabled = o.answerEnabled;
    payload.acceptedDiscards = o.acceptedDiscards as TileCode[];
    payload.explanation = o.explanation;
  }

  if ('tags' in o) {
    if (!Array.isArray(o.tags) || !o.tags.every((t) => typeof t === 'string')) {
      return { ok: false, reason: 'タグが不正です' };
    }
    payload.tags = o.tags as string[];
  }
  if ('sourceUrl' in o) {
    if (typeof o.sourceUrl !== 'string') {
      return { ok: false, reason: '出典URLが不正です' };
    }
    payload.sourceUrl = o.sourceUrl;
  }

  // 禁止フィールドが混入していないか
  const forbidden = [
    'id',
    'privateMemo',
    'attachments',
    'confirmationCount',
    'study',
    'attempts',
    'createdAt',
    'updatedAt',
    'tagIds',
  ];
  for (const key of forbidden) {
    if (key in o) {
      return { ok: false, reason: '共有データに許可されないフィールドがあります' };
    }
  }

  return { ok: true, payload };
}

export function buildShareUrl(appOrigin: string, basePath: string, encoded: string): string {
  const base = `${appOrigin.replace(/\/$/, '')}${basePath === '/' ? '' : basePath.replace(/\/$/, '')}/`;
  return `${base}#share=${encoded}`;
}

export function parseShareFromHash(hash: string): string | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(h);
  return params.get('share');
}

export function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  );
}

export function shareUrlTooLong(url: string): boolean {
  return url.length > LIMITS.shareUrlMaxChars;
}

/** ペイロードに正解・解説が物理的に含まれないことを検査 */
export function payloadOmitsAnswer(payload: SharePayload): boolean {
  return (
    !('answerEnabled' in payload) &&
    !('acceptedDiscards' in payload) &&
    !('explanation' in payload)
  );
}
