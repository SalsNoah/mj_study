import { allTiles, tileLabel, tileSuit } from '@/domain/tiles';
import type { TileCode } from '@/domain/types';
import { TileFace } from './TileFace';

const SUITS = [
  { id: 'm', label: '萬子' },
  { id: 'p', label: '筒子' },
  { id: 's', label: '索子' },
  { id: 'z', label: '字牌' },
] as const;

type Props = {
  onPick: (code: TileCode) => void;
  disabled?: boolean;
};

export function TilePalette({ onPick, disabled }: Props) {
  const tiles = allTiles();
  return (
    <div className="tile-palette" aria-label="牌パレット">
      {SUITS.map((suit) => (
        <div key={suit.id} className="tile-palette__suit">
          <div className="tile-palette__label">{suit.label}</div>
          <div className="tile-row tile-row--wrap">
            {tiles
              .filter((t) => tileSuit(t) === suit.id)
              .map((code) => (
                <TileFace
                  key={code}
                  code={code}
                  size={36}
                  onClick={disabled ? undefined : () => onPick(code)}
                />
              ))}
          </div>
        </div>
      ))}
      <p className="sr-only">牌をタップして追加。読み上げ名は各ボタンのラベルです。</p>
      <span className="sr-only">{tiles.map(tileLabel).join('、')}</span>
    </div>
  );
}
