export type ScoreInputMode = 'hundreds' | 'exact';
export type ScoreEntry = { draft: string; mode: ScoreInputMode; error: string | null };
export const canUseHundreds = (value: number | null) => value === null || (Number.isInteger(value) && value % 100 === 0 && Math.abs(value) <= 99900);
export function scoreEntryFromValue(value: number | null, exact = false): ScoreEntry {
  const mode: ScoreInputMode = exact || !canUseHundreds(value) ? 'exact' : 'hundreds';
  const draft = value === null ? '' : String(mode === 'hundreds' ? value / 100 : value);
  const parsed = parseScoreInput(draft, mode);
  return { draft, mode, error: parsed.ok ? null : parsed.error };
}
export function parseScoreInput(draft: string, mode: ScoreInputMode): { ok: true; value: number | null } | { ok: false; error: string } {
  if (draft === '') return { ok: true, value: null };
  if (draft.trim() !== draft || !(mode === 'hundreds' ? /^-?\d{1,3}$/ : /^-?\d+$/).test(draft)) {
    return { ok: false, error: mode === 'hundreds' ? '符号を除く3桁以内の整数で入力してください。' : '点数を整数で入力してください。' };
  }
  const value = Number(draft) * (mode === 'hundreds' ? 100 : 1);
  if (!Number.isSafeInteger(value) || value < -100000 || value > 200000) return { ok: false, error: '点数は−100000〜200000の範囲で入力してください。' };
  return { ok: true, value };
}
