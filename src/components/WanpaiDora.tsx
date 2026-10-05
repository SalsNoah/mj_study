import type { TileCode } from '@/domain/types';
import { TileFace } from './TileFace';

const SLOTS = 5;

type Props = {
  doras: TileCode[];
  onRemove?: (index: number) => void;
};

/**
 * 5枚の表示枠を左から保存順に開き、未公開牌は裏向きにする。
 */
export function WanpaiDora({ doras, onRemove }: Props) {
  const shown = doras.slice(0, SLOTS);
  const cells: Array<{ kind: 'back' } | { kind: 'dora'; code: TileCode; index: number }> = Array.from(
    { length: SLOTS },
    () => ({ kind: 'back' as const }),
  );
  shown.forEach((code, i) => {
    cells[i] = { kind: 'dora', code, index: i };
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
