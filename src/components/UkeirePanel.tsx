import { type AnalysisHand, type Ukeire } from '@/domain/ukeire';
import { tileLabel } from '@/domain/tiles';
import { TileFace } from './TileFace';
import { RemainingControls } from './RemainingControls';
import { useUkeireSession, type UkeireSession } from './useUkeireSession';

function shantenLabel(value: number): string {
  if (value === -1) return '完成形';
  if (value === 0) return 'テンパイ';
  return `${value}シャンテン`;
}

function EffectiveTiles({ value }: { value: Ukeire }) {
  return (
    <ul className="ukeire-tiles" aria-label="有効牌と残枚数">
      {value.effective.map(({ tile, remaining }) => (
        <li key={tile} className={remaining === 0 ? 'ukeire-zero' : undefined}>
          <TileFace code={tile} size={25} />
          <span>{remaining}枚</span>
        </li>
      ))}
    </ul>
  );
}

export function RemainingButton({ session }: { session: UkeireSession }) {
  return <button type="button" className="btn remaining-toggle" aria-expanded={session.open} aria-controls={session.panelId}
    disabled={session.analysis.status !== 'ready'} onClick={session.toggle}>残枚数</button>;
}

export function RemainingSettings({ session }: { session: UkeireSession }) {
  if (session.analysis.status !== 'ready') return null;
  return <div id={session.panelId} hidden={!session.open}>
    <RemainingControls key={session.key} limits={session.limits} overrides={session.overrides} onChange={session.setOverrides} />
  </div>;
}

export function UkeirePanel({ sessionKey, ...input }: AnalysisHand & { sessionKey?: string }) {
  const session = useUkeireSession(input, sessionKey);
  return <UkeireResults session={session} showSettings />;
}

export function UkeireResults({ session, showSettings = false, defaultOpen = true }: { session: UkeireSession; showSettings?: boolean; defaultOpen?: boolean }) {
  const { analysis } = session;
  return (
    <details className="panel ukeire-panel" open={defaultOpen}>
      <summary className="section-title">受入れ</summary>
      {showSettings && <><RemainingButton session={session} /><RemainingSettings session={session} /></>}
      {analysis.status !== 'ready' ? (
        <div role="status">
          {analysis.status === 'partial' ? <p className="hint">13〜14枚で表示</p>
            : analysis.reasons.map((reason) => <p className="hint" key={reason}>{reason}</p>)}
        </div>
      ) : (
        <>
          <p className="ukeire-current"><strong>{shantenLabel(analysis.currentShanten)}</strong></p>
          {analysis.mode === 'discard' ? (
            <ol className="ukeire-list" aria-label="打牌別の受入れ">
              {analysis.discards.map((row) => (
                <li className="ukeire-row" key={row.discard}>
                  <div className="ukeire-row__heading">
                    <span className="ukeire-discard" aria-label={`${tileLabel(row.discard)}を切る`}><span>打</span><TileFace code={row.discard} size={30} /></span>
                    <strong>{shantenLabel(row.shanten)}</strong>
                    <span className="ukeire-total">{row.kinds}種・{row.total}枚</span>
                  </div>
                  <EffectiveTiles value={row} />
                </li>
              ))}
            </ol>
          ) : analysis.current && (
            <div className="ukeire-row">
              <p className="ukeire-total">{analysis.current.kinds}種・{analysis.current.total}枚</p>
              <EffectiveTiles value={analysis.current} />
            </div>
          )}
        </>
      )}
    </details>
  );
}
