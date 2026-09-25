import type { ProblemContext, Wind } from './types';

export function windLabel(w: Wind | null): string {
  if (w === '1z') return '東';
  if (w === '2z') return '南';
  if (w === '3z') return '西';
  if (w === '4z') return '北';
  return '';
}

export function contextSummary(ctx: ProblemContext): string {
  const parts: string[] = [];
  const rw = windLabel(ctx.roundWind);
  if (rw && ctx.handNumber) parts.push(`${rw}${ctx.handNumber}局`);
  else if (rw) parts.push(`${rw}場`);
  else if (ctx.handNumber) parts.push(`${ctx.handNumber}局`);
  if (ctx.honba !== null) parts.push(`${ctx.honba}本場`);
  const sw = windLabel(ctx.seatWind);
  if (sw) parts.push(`${sw}家`);
  if (ctx.turn !== null) parts.push(`${ctx.turn}巡目`);
  if (ctx.riichiSticks !== null) parts.push(`供託${ctx.riichiSticks}`);
  return parts.join(' ') || '条件未設定';
}

export function scoresSummary(ctx: ProblemContext): string {
  const entries: Array<[string, number | null]> = [
    ['東', ctx.scores.east],
    ['南', ctx.scores.south],
    ['西', ctx.scores.west],
    ['北', ctx.scores.north],
  ];
  return entries
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}${(v as number).toLocaleString()}`)
    .join(' ');
}
