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
  /** 隙間なし・親幅に合わせて一列 */
  tight?: boolean;
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
  tight = false,
  onSelectConcealed,
  onSelectDrawn,
  onSelectCode,
  selectedCodes,
  selectablePool = 'none',
}: HandProps) {
  return (
    <div className={`hand-view${tight ? ' hand-view--tight' : ''}`}>
      {melds.length > 0 && (
        <div className="hand-view__melds">
          {melds.map((m) => (
            <MeldView key={m.id} meld={m} size={tight ? undefined : size * 0.9} tight={tight} />
          ))}
        </div>
      )}
      <div className="hand-view__main">
        <div className={tight ? 'hand-strip' : 'tile-row tile-row--wrap'}>
          {concealed.map((code, i) => (
            <TileFace
              key={`c-${i}-${code}`}
              code={code}
              size={size}
              fluid={tight}
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
          <div className="hand-view__drawn" aria-label="ツモ">
            <TileFace
              code={drawn}
              size={size}
              fluid={tight}
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

export function MeldView({
  meld,
  size = 32,
  tight = false,
}: {
  meld: Meld;
  size?: number;
  tight?: boolean;
}) {
  const tiles = meld.tiles;
  const face = (code: TileCode, extra?: { rotated?: boolean; back?: boolean }) => (
    <TileFace code={code} size={size} fluid={tight} rotated={extra?.rotated} back={extra?.back} />
  );
  if (meld.type === 'closedKan') {
    return (
      <div className="meld-view" aria-label="暗槓">
        {face(tiles[0]!, { back: true })}
        {face(tiles[1]!)}
        {face(tiles[2]!)}
        {face(tiles[3]!, { back: true })}
      </div>
    );
  }
  if (meld.type === 'addedKan') {
    return (
      <div className="meld-view meld-view--added" aria-label="加槓">
        {tiles.slice(0, 3).map((code, i) => (
          <span key={i} className="meld-view__stack">
            {face(code, { rotated: meld.calledIndex === i })}
            {meld.addedIndex === i && (
              <span className="meld-view__added">{face(tiles[3]!)}</span>
            )}
          </span>
        ))}
        {meld.addedIndex === 3 && (
          <span className="meld-view__stack">{face(tiles[3]!)}</span>
        )}
      </div>
    );
  }
  return (
    <div className="meld-view" aria-label={meld.type}>
      {tiles.map((code, i) => (
        <span key={i}>{face(code, { rotated: meld.calledIndex === i })}</span>
      ))}
    </div>
  );
}
