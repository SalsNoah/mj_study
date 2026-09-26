import type { Meld, ProblemContext, TileCode } from '@/domain/types';
import { contextSummary, scoresSummary } from '@/domain/context';
import { HandView, type TileMark } from './HandView';
import { WanpaiDora } from './WanpaiDora';

type Props = {
  concealed: TileCode[];
  drawn?: TileCode | null;
  melds: Meld[];
  doraIndicators: TileCode[];
  context?: ProblemContext;
  selectable?: boolean;
  selectedCodes?: ReadonlySet<TileCode>;
  marks?: ReadonlyMap<TileCode, TileMark>;
  onSelectCode?: (code: TileCode) => void;
};

/** 問題作成画面と同じ盤面：左上に対局条件、右上に王牌とドラ、下に手牌一列＋縮小した副露 */
export function HandBoard({
  concealed,
  drawn = null,
  melds,
  doraIndicators,
  context,
  selectable = false,
  selectedCodes,
  marks,
  onSelectCode,
}: Props) {
  const scores = context ? scoresSummary(context) : '';
  return (
    <div className="hand-stage" aria-label="牌姿">
      <div className="hand-stage__top">
        <div className="hand-stage__meta">
          {context && <p>{contextSummary(context)}</p>}
          {scores && <p className="hand-stage__scores">{scores}</p>}
        </div>
        <WanpaiDora doras={doraIndicators} />
      </div>
      <HandView
        concealed={concealed}
        drawn={drawn}
        melds={melds}
        tight
        selectablePool={selectable ? 'concealedDrawn' : 'none'}
        selectedCodes={selectedCodes}
        marks={marks}
        onSelectCode={selectable ? onSelectCode : undefined}
      />
    </div>
  );
}
