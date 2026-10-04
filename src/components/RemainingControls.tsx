import { useId, useState } from 'react';
import { parseRemainingInput, type RemainingOverrides } from '@/domain/remaining';
import { NORMAL_TILES } from '@/domain/ukeire';
import { tileLabel } from '@/domain/tiles';
import type { TileCode } from '@/domain/types';
import { TileFace } from './TileFace';

function RemainingControl({ tile, upper, value, manual, onChange, onReset }: {
  tile: TileCode; upper: number; value: number; manual: boolean;
  onChange: (value: number) => void; onReset: () => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const hintId = useId();
  const label = tileLabel(tile);
  const apply = (text: string) => {
    setDraft(text);
    const parsed = parseRemainingInput(text, upper);
    setError(parsed.ok ? null : parsed.reason);
    if (parsed.ok) onChange(parsed.value);
  };
  const step = (delta: number) => apply(String(value + delta));
  return (
    <li className="remaining-control">
      <div className="remaining-control__label">
        <TileFace code={tile} size={25} />
        <strong>{label}</strong>
        <span className="remaining-status">{manual ? '手動' : '自動'}</span>
        <small id={hintId}>上限 {upper}枚</small>
      </div>
      <div className="remaining-control__actions">
        <button type="button" className="btn" aria-label={`${label}の残枚数を1枚減らす`} disabled={value <= 0} onClick={() => step(-1)}>−</button>
        <input
          type="text" inputMode="numeric" pattern="[0-9]*"
          aria-label={`${label}の残枚数`} aria-describedby={`${hintId}${error ? ` ${hintId}-error` : ''}`}
          aria-invalid={!!error} value={draft} onChange={(event) => apply(event.target.value)}
        />
        <button type="button" className="btn" aria-label={`${label}の残枚数を1枚増やす`} disabled={value >= upper} onClick={() => step(1)}>＋</button>
        <button type="button" className="btn remaining-reset" aria-label={`${label}の残枚数を自動に戻す`} disabled={!manual && !error} onClick={() => {
          setDraft(String(upper)); setError(null); onReset();
        }}>自動へ</button>
      </div>
      {error && <p className="error remaining-error" id={`${hintId}-error`} role="alert">{error} 入力は未反映です（集計は{value}枚）。</p>}
    </li>
  );
}

export function RemainingControls({ limits, overrides, onChange }: {
  limits: readonly number[]; overrides: RemainingOverrides; onChange: (next: RemainingOverrides) => void;
}) {
  const [resetCount, setResetCount] = useState(0);
  return (
    <section className="remaining-panel" aria-label="残枚数の調整">
      <button type="button" className="btn" onClick={() => { onChange({}); setResetCount((n) => n + 1); }}>すべて自動に戻す</button>
      <ul className="remaining-grid" aria-label="牌ごとの残枚数調整">
        {NORMAL_TILES.map((tile, index) => (
          <RemainingControl
            key={`${resetCount}:${tile}`} tile={tile} upper={limits[index]!}
            value={overrides[tile] ?? limits[index]!} manual={overrides[tile] !== undefined}
            onChange={(value) => onChange({ ...overrides, [tile]: value })}
            onReset={() => { const next = { ...overrides }; delete next[tile]; onChange(next); }}
          />
        ))}
      </ul>
    </section>
  );
}
