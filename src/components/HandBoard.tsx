import type { Meld, ProblemContext, TileCode } from '@/domain/types';
import { contextSummary, scoresSummary } from '@/domain/context';
import { HandView } from './HandView';
import { WanpaiDora } from './WanpaiDora';

type Props = {
  concealed: TileCode[];
  drawn?: TileCode | null;
  melds: Meld[];
  doraIndicators: TileCode[];
  context?: ProblemContext;
  selectable?: boolean;
  selectedCodes?: ReadonlySet<TileCode>;
  onSelectCode?: (code: TileCode) => void;
};

/** 参考サイト風の盤面：左上に対局条件、右上に王牌とドラ、下に手牌一列 */
export function HandBoard({
  concealed,
  drawn = null,
  melds,
  doraIndicators,
  context,
  selectable = false,
  selectedCodes,
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
        onSelectCode={selectable ? onSelectCode : undefined}
      />
    </div>
  );
}
