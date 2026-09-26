import type { TileCode } from '@/domain/types';
import type { Meld } from '@/domain/types';
import { TileFace } from './TileFace';

export type TileMark = 'correct' | 'wrong';

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
  /** 手牌は盤面幅の1/14で隙間なし一列、副露は縮小して右側に並べる */
  tight?: boolean;
  onSelectConcealed?: (index: number) => void;
  onSelectDrawn?: () => void;
  onSelectCode?: (code: TileCode) => void;
  onRemoveMeld?: (meldId: string) => void;
  selectedCodes?: ReadonlySet<TileCode>;
  marks?: ReadonlyMap<TileCode, TileMark>;
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
  onRemoveMeld,
  selectedCodes,
  marks,
  selectablePool = 'none',
}: HandProps) {
  const markClass = (code: TileCode) => {
    const m = marks?.get(code);
    return m ? `is-${m}` : '';
  };

  const concealedTiles = concealed.map((code, i) => (
    <TileFace
      key={`c-${i}-${code}`}
      code={code}
      size={size}
      fluid={tight}
      className={markClass(code)}
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
  ));

  const drawnTile = drawn && (
    <div className="hand-view__drawn" aria-label="ツモ">
      <TileFace
        code={drawn}
        size={size}
        fluid={tight}
        className={markClass(drawn)}
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
  );

  const meldList = melds.map((m) =>
    onRemoveMeld ? (
      <button
        key={m.id}
        type="button"
        className="meld-btn"
        aria-label="この副露を削除"
        onClick={() => onRemoveMeld(m.id)}
      >
        <MeldView meld={m} size={size * 0.9} tight={tight} />
      </button>
    ) : (
      <MeldView key={m.id} meld={m} size={size * 0.9} tight={tight} />
    ),
  );

  if (tight) {
    return (
      <div className="hand-view hand-view--tight">
        <div className="hand-row">
          <div className="hand-strip">{concealedTiles}</div>
          {drawnTile}
          {melds.length > 0 && <div className="hand-melds">{meldList}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="hand-view">
      {melds.length > 0 && <div className="hand-view__melds">{meldList}</div>}
      <div className="hand-view__main">
        <div className="tile-row tile-row--wrap">{concealedTiles}</div>
        {drawnTile}
      </div>
    </div>
  );
}

/** 鳴いた牌は横向き。加槓は横向きの牌の上にもう1枚横向きで重ねる。 */
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
  const face = (code: TileCode, key: string, extra?: { rotated?: boolean; back?: boolean }) => (
    <TileFace
      key={key}
      code={code}
      size={size}
      fluid={tight}
      rotated={extra?.rotated}
      back={extra?.back}
    />
  );

  if (meld.type === 'closedKan') {
    return (
      <div className="meld-view" aria-label="暗槓">
        {face(tiles[0]!, 'a', { back: true })}
        {face(tiles[1]!, 'b')}
        {face(tiles[2]!, 'c')}
        {face(tiles[3]!, 'd', { back: true })}
      </div>
    );
  }

  if (meld.type === 'addedKan') {
    const stackAt = meld.calledIndex ?? meld.addedIndex ?? 0;
    return (
      <div className="meld-view" aria-label="加槓">
        {tiles.slice(0, 3).map((code, i) =>
          i === stackAt ? (
            <span key={i} className="meld-view__stack">
              {face(tiles[3]!, 'added', { rotated: true })}
              {face(code, 'called', { rotated: true })}
            </span>
          ) : (
            face(code, `t${i}`)
          ),
        )}
      </div>
    );
  }

  const label = meld.type === 'chi' ? 'チー' : meld.type === 'pon' ? 'ポン' : '明槓';
  return (
    <div className="meld-view" aria-label={label}>
      {tiles.map((code, i) => face(code, `t${i}`, { rotated: meld.calledIndex === i }))}
    </div>
  );
}
