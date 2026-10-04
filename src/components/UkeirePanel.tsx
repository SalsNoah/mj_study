import { useMemo, useState } from 'react';
import { analyzeHand, type AnalysisHand, type Ukeire } from '@/domain/ukeire';
import { adjustUkeire, remainingLimits, remainingSessionKey, type RemainingOverrides } from '@/domain/remaining';
import { tileLabel } from '@/domain/tiles';
import { TileFace } from './TileFace';
import { RemainingControls } from './RemainingControls';

function shantenLabel(value: number): string {
  if (value === -1) return '完成形（−1）';
  if (value === 0) return 'テンパイ（0）';
  return `${value}シャンテン`;
}

function EffectiveTiles({ value, overrides }: { value: Ukeire; overrides: RemainingOverrides }) {
  const available = value.effective.filter((tile) => tile.remaining > 0);
  const exhausted = value.effective.filter((tile) => tile.remaining === 0);
  return (
    <>
      <ul className="ukeire-tiles" aria-label="有効牌と残枚数">
        {available.map(({ tile, remaining }) => (
          <li key={tile}>
            <TileFace code={tile} size={25} />
            <span>{remaining}枚{overrides[tile] !== undefined && <small className="remaining-inline"> 手動</small>}</span>
          </li>
        ))}
      </ul>
      {available.length === 0 && <p className="hint">残りのある有効牌はありません。</p>}
      {exhausted.length > 0 && (
        <p className="hint ukeire-zero">形上は有効・残り0枚：{exhausted.map(({ tile }) => `${tileLabel(tile)}${overrides[tile] !== undefined ? '（手動）' : ''}`).join('、')}</p>
      )}
    </>
  );
}

export function UkeirePanel({ sessionKey, ...input }: AnalysisHand & { sessionKey?: string }) {
  return <UkeireSession key={remainingSessionKey(input, sessionKey)} {...input} />;
}

function UkeireSession({ concealed, drawn, melds, doraIndicators }: AnalysisHand) {
  const raw = useMemo(() => analyzeHand({ concealed, drawn, melds, doraIndicators }), [concealed, drawn, melds, doraIndicators]);
  const limits = useMemo(() => raw.status === 'ready' ? remainingLimits({ concealed, drawn, melds, doraIndicators }) : [], [raw, concealed, drawn, melds, doraIndicators]);
  const [overrides, setOverrides] = useState<RemainingOverrides>({});
  const analysis = raw.status === 'ready' ? {
    ...raw,
    current: raw.current ? adjustUkeire(raw.current, overrides, limits) : null,
    discards: raw.discards.map((row) => adjustUkeire(row, overrides, limits)),
  } : raw;
  const manualCount = Object.keys(overrides).length;
  const countLabel = manualCount ? '調整後残枚数' : '理論残枚数';
  return (
    <details className="panel ukeire-panel" open>
      <summary className="section-title">受け入れを比較 <span className="ukeire-rule">四麻・34種</span></summary>
      <p className="hint">手牌構成上のシャンテンを下げる牌です。通常形・七対子・国士無双の最小値（副露・暗槓がある場合は通常形のみ）。</p>
      {analysis.status !== 'ready' ? (
        <div role="status">
          {analysis.reasons.map((reason) => <p className="hint" key={reason}>{reason}</p>)}
        </div>
      ) : (
        <>
          <p className="ukeire-current">現在：<strong>{shantenLabel(analysis.currentShanten)}</strong></p>
          <p className="hint ukeire-count-note">理論残枚数＝4枚−入力済みの手牌・ツモ・副露・ドラ表示牌。切る牌も引いたままです。河全体などが未入力なので、実際の山残枚数ではなく上限です。赤五と通常五は同じ牌種に数えます。</p>
          <p className="hint">調整はこの画面内のみです。牌姿・ツモ・副露・ドラ表示牌の変更や画面移動で自動に戻り、保存・共有には含まれません。</p>
          <RemainingControls limits={limits} overrides={overrides} onChange={setOverrides} />
          <p className="ukeire-adjust-status" role="status">{manualCount ? `${manualCount}種を手動設定中（全打牌候補に共通）` : '残枚数はすべて自動計算'}。種類数は残り1枚以上の有効牌だけを数えます。</p>
          {analysis.mode === 'discard' ? (
            <>
              <p className="hint">切る牌ごとに、打牌後の受け入れを表示。牌順です。受け入れの多さだけで最善打牌や正解は決まりません。</p>
              <ol className="ukeire-list" aria-label="打牌別の受け入れ">
                {analysis.discards.map((row) => (
                  <li className="ukeire-row" key={row.discard}>
                    <div className="ukeire-row__heading">
                      <span className="ukeire-discard"><TileFace code={row.discard} size={30} /><span>{tileLabel(row.discard)}を切る</span></span>
                      <span>打牌後 <strong>{shantenLabel(row.shanten)}</strong></span>
                    </div>
                    <p className="ukeire-total">受け入れ <strong>{row.kinds}種・{row.total}枚</strong> <span>（{countLabel}）</span></p>
                    <EffectiveTiles value={row} overrides={overrides} />
                  </li>
                ))}
              </ol>
            </>
          ) : analysis.current && (
            <div className="ukeire-row">
              <p className="hint">13枚相当の現在の受け入れです。打牌別の比較には1枚追加してください。</p>
              <p className="ukeire-total">受け入れ <strong>{analysis.current.kinds}種・{analysis.current.total}枚</strong> <span>（{countLabel}）</span></p>
              <EffectiveTiles value={analysis.current} overrides={overrides} />
            </div>
          )}
          <p className="hint">0はテンパイ、−1は完成形。役・フリテン・打牌の可否や流局時の聴牌判定は含みません。三麻の牌種除外・抜きドラには未対応です。</p>
        </>
      )}
    </details>
  );
}
