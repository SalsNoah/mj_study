import type { TileCode } from '@/domain/types';
import type { Meld } from '@/domain/types';
import { TileFace } from './TileFace';

type RowProps = {
  tiles: TileCode[];
  size?: number;
  selectedIndex?: number | null;
  selectedCodes?: ReadonlySet<TileCode>;
  onSelectIndex?: (index: number) => void;
  onSelectCode?: (code: TileCode, index: number) => void;
  gap?: number;
};

export function TileRow({
  tiles,
  size = 40,
  selectedIndex = null,
  selectedCodes,
  onSelectIndex,
  onSelectCode,
  gap = 3,
}: RowProps) {
  return (
    <div className="tile-row" style={{ gap }}>
      {tiles.map((code, i) => (
        <TileFace
          key={`${code}-${i}`}
          code={code}
          size={size}
          selected={
            selectedIndex === i || (selectedCodes?.has(code) ?? false)
          }
          onClick={
            onSelectIndex || onSelectCode
              ? () => {
                  onSelectIndex?.(i);
                  onSelectCode?.(code, i);
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

type HandProps = {
  concealed: TileCode[];
  drawn: TileCode | null;
  melds: Meld[];
  size?: number;
  onSelectConcealed?: (index: number) => void;
  onSelectDrawn?: () => void;
  onSelectCode?: (code: TileCode) => void;
  selectedCodes?: ReadonlySet<TileCode>;
  selectablePool?: 'none' | 'concealedDrawn';
};

export function HandView({
  concealed,
  drawn,
  melds,
  size = 36,
  onSelectConcealed,
  onSelectDrawn,
  onSelectCode,
  selectedCodes,
  selectablePool = 'none',
}: HandProps) {
  return (
    <div className="hand-view">
      <div className="hand-view__melds">
        {melds.map((m) => (
          <MeldView key={m.id} meld={m} size={size * 0.9} />
        ))}
      </div>
      <div className="hand-view__main">
        <div className="tile-row tile-row--scroll">
          {concealed.map((code, i) => (
            <TileFace
              key={`c-${i}-${code}`}
              code={code}
              size={size}
              selected={selectedCodes?.has(code)}
              onClick={
                selectablePool === 'concealedDrawn' || onSelectConcealed
                  ? () => {
                      onSelectConcealed?.(i);
                      onSelectCode?.(code);
                    }
                  : undefined
              }
            />
          ))}
        </div>
        {drawn && (
          <div className="hand-view__drawn">
            <TileFace
              code={drawn}
              size={size}
              selected={selectedCodes?.has(drawn)}
              onClick={
                selectablePool === 'concealedDrawn' || onSelectDrawn
                  ? () => {
                      onSelectDrawn?.();
                      onSelectCode?.(drawn);
                    }
                  : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function MeldView({ meld, size = 32 }: { meld: Meld; size?: number }) {
  const tiles = meld.tiles;
  if (meld.type === 'closedKan') {
    return (
      <div className="meld-view" aria-label="暗槓">
        <TileFace code={tiles[0]!} size={size} back />
        <TileFace code={tiles[1]!} size={size} />
        <TileFace code={tiles[2]!} size={size} />
        <TileFace code={tiles[3]!} size={size} back />
      </div>
    );
  }
  if (meld.type === 'addedKan') {
    return (
      <div className="meld-view meld-view--added" aria-label="加槓">
        {tiles.slice(0, 3).map((code, i) => (
          <span key={i} className="meld-view__stack">
            <TileFace
              code={code}
              size={size}
              rotated={meld.calledIndex === i}
            />
            {meld.addedIndex === i && (
              <span className="meld-view__added">
                <TileFace code={tiles[3]!} size={size * 0.85} />
              </span>
            )}
          </span>
        ))}
        {meld.addedIndex === 3 && (
          <span className="meld-view__stack">
            <TileFace code={tiles[3]!} size={size} />
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="meld-view" aria-label={meld.type}>
      {tiles.map((code, i) => (
        <TileFace
          key={i}
          code={code}
          size={size}
          rotated={meld.calledIndex === i}
        />
      ))}
    </div>
  );
}
