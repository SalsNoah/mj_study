import { normalize, similarity } from './imageTools';

/** ラベル（牌コード・文字）ごとの見本。特徴量を base64 で保存する */
export type Bank = Record<string, string[]>;

const MAX_PER_LABEL = 4;

export function encodeFeature(feat: Uint8Array): string {
  let s = '';
  for (let i = 0; i < feat.length; i++) s += String.fromCharCode(feat[i]!);
  return btoa(s);
}

export function decodeFeature(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function learn(bank: Bank, label: string, feat: Uint8Array): Bank {
  const list = [...(bank[label] ?? []), encodeFeature(feat)].slice(-MAX_PER_LABEL);
  return { ...bank, [label]: list };
}

export type PreparedBank = Array<{ label: string; vec: Float32Array; centered: Float32Array }>;

/** 明るさの平均だけをそろえたベクトル（白のように模様のない牌でも差を測れる） */
function centered(feat: Uint8Array): Float32Array {
  let mean = 0;
  for (let i = 0; i < feat.length; i++) mean += feat[i]!;
  mean /= feat.length;
  const out = new Float32Array(feat.length);
  for (let i = 0; i < feat.length; i++) out[i] = feat[i]! - mean;
  return out;
}

/** 濃淡の差の大きさから求める一致度（同じなら1、差がRMSで64あれば0） */
function closeness(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return Math.max(-1, 1 - Math.sqrt(sum / a.length) / 64);
}

export function prepareBank(bank: Bank): PreparedBank {
  const out: PreparedBank = [];
  for (const [label, list] of Object.entries(bank)) {
    for (const t of list) {
      const f = decodeFeature(t);
      out.push({ label, vec: normalize(f), centered: centered(f) });
    }
  }
  return out;
}

export type Match = { label: string | null; score: number; margin: number };

/** 模様のパターンの相関と、濃淡の差の小ささの、よい方を一致度にする */
export function classify(bank: PreparedBank, feat: Uint8Array): Match {
  if (bank.length === 0) return { label: null, score: 0, margin: 0 };
  const v = normalize(feat);
  const c = centered(feat);
  const best = new Map<string, number>();
  for (const t of bank) {
    if (t.vec.length !== v.length) continue;
    const s = Math.max(similarity(v, t.vec), closeness(c, t.centered));
    if (s > (best.get(t.label) ?? -2)) best.set(t.label, s);
  }
  if (best.size === 0) return { label: null, score: 0, margin: 0 };
  const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  return {
    label: top![0],
    score: top![1],
    margin: top![1] - (second?.[1] ?? -1),
  };
}

export function labelCount(bank: Bank): number {
  return Object.keys(bank).length;
}
