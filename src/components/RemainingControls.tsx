import { useId, useState } from 'react';
import { parseRemainingInput, type RemainingOverrides } from '@/domain/remaining';
import { NORMAL_TILES } from '@/domain/ukeire';
import { tileLabel } from '@/domain/tiles';
import type { TileCode } from '@/domain/types';
import { TileFace } from './TileFace';

const SUITS = [
  { code: 'm', label: '萬子' }, { code: 'p', label: '筒子' },
  { code: 's', label: '索子' }, { code: 'z', label: '字牌' },
] as const;

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
    <div className="remaining-control">
      <div className="remaining-control__label">
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
    </div>
  );
}

export function RemainingControls({ limits, overrides, onChange }: {
  limits: readonly number[]; overrides: RemainingOverrides; onChange: (next: RemainingOverrides) => void;
}) {
  const [selected, setSelected] = useState<TileCode>('1m');
  const [resetCount, setResetCount] = useState(0);
  const activeSuit = selected[1];
  const upper = limits[NORMAL_TILES.indexOf(selected)]!;
  return (
    <section className="remaining-panel" aria-label="残枚数の調整">
      <div className="remaining-suits" role="group" aria-label="残枚数の牌種">
        {SUITS.map(({ code, label }) => {
          const count = NORMAL_TILES.filter((tile) => tile[1] === code && overrides[tile] !== undefined).length;
          return <button type="button" key={code} aria-pressed={activeSuit === code}
            aria-label={`${label}${count ? `、${count}種を調整中` : ''}`} onClick={() => {
              if (activeSuit !== code) setSelected(`1${code}`);
            }}>
            {label}{count > 0 && <span className="remaining-suit-count" aria-hidden="true">{count}</span>}
          </button>;
        })}
      </div>
      <ul className="remaining-grid" aria-label="牌ごとの残枚数調整">
        {NORMAL_TILES.filter((tile) => tile[1] === activeSuit).map((tile) => {
          const value = overrides[tile] ?? limits[NORMAL_TILES.indexOf(tile)]!;
          const manual = overrides[tile] !== undefined;
          return <li key={tile}>
            <button type="button" className={`remaining-tile${manual ? ' is-manual' : ''}${value === 0 ? ' is-empty' : ''}`}
              aria-label={`${tileLabel(tile)}、残り${value}枚、${manual ? '手動' : '自動'}`}
              aria-pressed={selected === tile} onClick={() => setSelected(tile)}>
              <TileFace code={tile} size={24} />
              <span className="remaining-tile__count" aria-hidden="true">{value}</span>
              {manual && <span className="remaining-tile__mark" aria-hidden="true" />}
            </button>
          </li>;
        })}
      </ul>
      <RemainingControl
        key={`${resetCount}:${selected}`} tile={selected} upper={upper}
        value={overrides[selected] ?? upper} manual={overrides[selected] !== undefined}
        onChange={(value) => onChange({ ...overrides, [selected]: value })}
        onReset={() => { const next = { ...overrides }; delete next[selected]; onChange(next); }}
      />
      <button type="button" className="remaining-reset-all" onClick={() => { onChange({}); setResetCount((n) => n + 1); }}>すべて自動に戻す</button>
    </section>
  );
}
