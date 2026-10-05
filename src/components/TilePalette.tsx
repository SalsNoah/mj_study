import { useState } from 'react';
import type { TileCode } from '@/domain/types';
import { TileFace } from './TileFace';

/** pystyle 何切るシミュレーター同様：数牌は1〜9のあと赤五、字牌は東南西北白發中 */
const ROWS: TileCode[][] = [
  ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '0m'],
  ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '0p'],
  ['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s', '0s'],
  ['1z', '2z', '3z', '4z', '5z', '6z', '7z'],
];

type Props = {
  onPick: (code: TileCode) => void;
  disabled?: boolean;
  /** Continuous editor input keeps all suits visible; other screens retain their current picker. */
  layout?: 'all' | 'suits';
  blockedReasons?: Partial<Record<TileCode, string>>;
};

export function TilePalette({ onPick, disabled, blockedReasons = {}, layout = 'suits' }: Props) {
  const [suit, setSuit] = useState(0);
  return (
    <div className={`tile-palette${layout === 'all' ? ' tile-palette--all' : ''}`} aria-label="牌パレット">
      {layout === 'suits' && <div className="tile-palette__suits" role="group" aria-label="牌の種類">
        {['萬子', '筒子', '索子', '字牌'].map((label, index) => <button type="button" key={label}
          aria-pressed={suit === index} onClick={() => setSuit(index)}>{label}</button>)}
      </div>}
      <div className="tile-palette__grid">
        {ROWS.map((row, ri) => (
          <div
            key={ri}
            hidden={layout === 'suits' && suit !== ri}
            className={`tile-palette__row${row.length === 7 ? ' tile-palette__row--honors' : ''}`}
          >
            {row.map((code) => (
              <TileFace
                key={code}
                code={code}
                fluid
                dimmed={disabled || !!blockedReasons[code]}
                disabled={disabled || !!blockedReasons[code]}
                disabledReason={blockedReasons[code]}
                onClick={() => onPick(code)}
              />
            ))}
          </div>
        ))}
      </div>

    </div>
  );
}
