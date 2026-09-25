import type { TileCode } from '@/domain/types';
import { TileFace } from './TileFace';

const SLOTS = 5;

type Props = {
  doras: TileCode[];
  onRemove?: (index: number) => void;
};

/**
 * 参考サイト同様：右上の王牌列。中央寄りにドラ表示牌、他は裏。
 */
export function WanpaiDora({ doras, onRemove }: Props) {
  const shown = doras.slice(0, SLOTS);
  const start = Math.min(2, SLOTS - Math.max(shown.length, 1));
  const cells: Array<{ kind: 'back' } | { kind: 'dora'; code: TileCode; index: number }> = Array.from(
    { length: SLOTS },
    () => ({ kind: 'back' as const }),
  );
  shown.forEach((code, i) => {
    const at = Math.min(start + i, SLOTS - 1);
    cells[at] = { kind: 'dora', code, index: i };
  });

  return (
    <div className="wanpai" aria-label="王牌・ドラ表示牌">
      {cells.map((cell, i) =>
        cell.kind === 'back' ? (
          <span key={`b-${i}`} className="wanpai__slot tile-face is-fluid is-back">
            <span className="tile-back" aria-hidden />
          </span>
        ) : (
          <TileFace
            key={`d-${cell.index}`}
            code={cell.code}
            fluid
            className="wanpai__slot"
            onClick={onRemove ? () => onRemove(cell.index) : undefined}
          />
        ),
      )}
    </div>
  );
}
