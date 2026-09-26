import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TileFace } from '@/components/TileFace';
import { TilePalette } from '@/components/TilePalette';
import { isTileCode } from '@/domain/tiles';
import { emptyContext, type Meld, type TileCode, type Wind } from '@/domain/types';
import {
  autoRead,
  GAME_NAMES,
  loadLocalBanks,
  loadModel,
  prepareModel,
  rematchCell,
  rememberTile,
  type AutoResult,
  type Model,
} from './autoRead';
import { putImportDraft, takePendingShot } from './draft';
import { inferMeld, scoresBySeat, type Seat } from './parse';
import { loadImage, type TileCell } from './recognize';

const WIND_NAME: Record<Wind, string> = { '1z': '東', '2z': '南', '3z': '西', '4z': '北' };
const SEAT_NAME: Record<Seat, string> = { self: '自分', right: '下家', across: '対面', left: '上家' };

type Target = { kind: 'hand'; i: number } | { kind: 'dora'; i: number } | { kind: 'meld'; g: number; i: number };

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'review'; result: AutoResult }
  | { kind: 'failed'; message: string };

function allCells(r: AutoResult): TileCell[] {
  return [...r.hand, ...r.dora, ...r.melds.flat()];
}

function firstUnsure(r: AutoResult): Target | null {
  const hi = r.hand.findIndex((c) => !c.sure);
  if (hi >= 0) return { kind: 'hand', i: hi };
  const di = r.dora.findIndex((c) => !c.sure);
  if (di >= 0) return { kind: 'dora', i: di };
  for (let g = 0; g < r.melds.length; g++) {
    const mi = r.melds[g]!.findIndex((c) => !c.sure);
    if (mi >= 0) return { kind: 'meld', g, i: mi };
  }
  return null;
}

/** 作成画面に渡せる形にする。組み立てられないときは理由を返す */
function toDraft(r: AutoResult): { ok: true; send: () => void } | { ok: false; reason: string } {
  if (allCells(r).some((c) => !c.label)) return { ok: false, reason: '「?」の牌を選んでください' };
  const melds: Meld[] = [];
  for (const [gi, g] of r.melds.entries()) {
    const m = inferMeld(g);
    if (!m.ok) return { ok: false, reason: `鳴き${gi + 1}組目：${m.reason}` };
    melds.push(m.meld);
  }
  const handMax = Math.max(0, 14 - melds.length * 3);
  const concealed = r.hand.map((c) => c.label).filter((l): l is TileCode => !!l && isTileCode(l));
  if (concealed.length > handMax) {
    return { ok: false, reason: `鳴きが${melds.length}組あるので手牌は${handMax}枚までです。余分な牌を除外してください` };
  }
  const hasScores = Object.values(r.scores).some((v) => v !== null);
  const notes =
    r.estimated.length > 0 && r.seatWind
      ? [
          `${r.estimated.map((s) => SEAT_NAME[s]).join('・')}の点数は読めなかったため、合計${
            r.players === 3 ? '10万5千' : '10万'
          }点から推定しています。`,
        ]
      : [];
  return {
    ok: true,
    send: () =>
      putImportDraft({
        concealed,
        melds,
        doraIndicators: r.dora
          .map((c) => c.label)
          .filter((l): l is TileCode => !!l && isTileCode(l))
          .slice(0, 5),
        context: {
          ...emptyContext(),
          roundWind: r.roundWind,
          handNumber: r.handNumber,
          seatWind: r.seatWind,
          turn: r.turn,
          scores: r.seatWind && hasScores ? scoresBySeat(r.seatWind, r.scores, r.players) : emptyContext().scores,
        },
        notes,
      }),
  };
}

function ReadCell({ cell, active, onClick }: { cell: TileCell; active: boolean; onClick: () => void }) {
  const code = cell.label && isTileCode(cell.label) ? cell.label : null;
  return (
    <button
      type="button"
      className={`read-cell${cell.sure ? '' : ' is-unsure'}${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={code ? `読み取り結果 ${code}` : '読めなかった牌'}
    >
      {code ? <TileFace code={code} fluid /> : <img src={cell.preview} alt="" />}
      {!cell.sure && <span className="read-cell__q">?</span>}
    </button>
  );
}

export function ImportPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [target, setTarget] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modelRef = useRef<Model | null>(null);

  const open = useCallback(
    async (file: Blob) => {
      setPhase({ kind: 'reading' });
      setError(null);
      try {
        const [{ img, url }, model] = await Promise.all([loadImage(file), loadModel()]);
        URL.revokeObjectURL(url);
        // 読み込み中の表示を先に出してから重い処理を始める
        await new Promise((r) => setTimeout(r, 30));
        modelRef.current = model;
        const result = autoRead(img, prepareModel(model, loadLocalBanks()));
        if (!result) {
          setPhase({
            kind: 'failed',
            message:
              '手牌を見つけられませんでした。雀魂・天鳳の対局中の画面（画面の下に自分の手牌が写っているもの）のスクショを選んでください。',
          });
          return;
        }
        const draft = toDraft(result);
        if (draft.ok && !firstUnsure(result)) {
          draft.send();
          navigate('/');
          return;
        }
        setPhase({ kind: 'review', result });
        setTarget(firstUnsure(result));
      } catch (e) {
        setPhase({ kind: 'failed', message: e instanceof Error ? e.message : '読み取りに失敗しました' });
      }
    },
    [navigate],
  );

  useEffect(() => {
    const file = takePendingShot();
    if (file) void open(file);
  }, [open]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) void open(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open]);

  const result = phase.kind === 'review' ? phase.result : null;

  const cellAt = (r: AutoResult, t: Target): TileCell | undefined =>
    t.kind === 'hand' ? r.hand[t.i] : t.kind === 'dora' ? r.dora[t.i] : r.melds[t.g]?.[t.i];

  const update = (r: AutoResult, t: Target, fn: (c: TileCell) => TileCell | null): AutoResult => {
    const apply = (list: TileCell[], i: number) =>
      list.flatMap((c, j) => {
        if (j !== i) return [c];
        const next = fn(c);
        return next ? [next] : [];
      });
    if (t.kind === 'hand') return { ...r, hand: apply(r.hand, t.i) };
    if (t.kind === 'dora') return { ...r, dora: apply(r.dora, t.i) };
    const { g, i } = t;
    return { ...r, melds: r.melds.map((m, gi) => (gi === g ? apply(m, i) : m)).filter((m) => m.length) };
  };

  const pick = (label: TileCode) => {
    if (!result || !target) return;
    const cell = cellAt(result, target);
    if (!cell) return;
    rememberTile(result.game, label, cell.feat);
    let next = update(result, target, (c) => ({ ...c, label, sure: true }));
    // 同じ牌が他にもあれば、覚えた見本で読み直す
    if (modelRef.current) {
      const bank = prepareModel(modelRef.current, loadLocalBanks())[result.game].tiles;
      next = {
        ...next,
        hand: next.hand.map((c) => rematchCell(c, bank)),
        dora: next.dora.map((c) => rematchCell(c, bank)),
        melds: next.melds.map((m) => m.map((c) => rematchCell(c, bank))),
      };
    }
    setPhase({ kind: 'review', result: next });
    setTarget(firstUnsure(next));
  };

  const remove = () => {
    if (!result || !target) return;
    const next = update(result, target, () => null);
    setPhase({ kind: 'review', result: next });
    setTarget(firstUnsure(next));
  };

  const acceptAll = () => {
    if (!result) return;
    const confirm = (c: TileCell) => (c.label ? { ...c, sure: true } : c);
    const next = {
      ...result,
      hand: result.hand.map(confirm),
      dora: result.dora.map(confirm),
      melds: result.melds.map((m) => m.map(confirm)),
    };
    setPhase({ kind: 'review', result: next });
    setTarget(firstUnsure(next));
  };

  const create = () => {
    if (!result) return;
    const d = toDraft(result);
    if (!d.ok) {
      setError(d.reason);
      return;
    }
    d.send();
    navigate('/');
  };

  const picker = (
    <label className="file-pick shot-pick">
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void open(f);
          e.target.value = '';
        }}
      />
      <strong>{result ? '別のスクショを選ぶ' : 'スクショを選ぶ'}</strong>
      <span>雀魂・天鳳の対局画面。PCでは Ctrl+V で貼り付けもできます</span>
    </label>
  );

  const current = result && target ? cellAt(result, target) : undefined;
  const unsure = result ? allCells(result).filter((c) => !c.sure).length : 0;

  return (
    <div className="page page--import">
      <header className="page-header page-header--compact">
        <h1>スクショから作成</h1>
      </header>

      {phase.kind !== 'review' && (
        <section className="panel">
          {picker}
          {phase.kind === 'reading' && <p className="ok">読み取り中…</p>}
          {phase.kind === 'failed' && <p className="error">{phase.message}</p>}
          {phase.kind === 'idle' && (
            <p className="hint">
              手牌・鳴き・ドラ・場風・局・自風・点数・巡目を自動で読み取り、作成画面に入れます。画像は端末の外に送りません。
            </p>
          )}
        </section>
      )}

      {result && (
        <>
          <section className="panel read-panel">
            <p className="hint">
              {GAME_NAMES[result.game]}のスクショとして読み取りました。
              {unsure > 0
                ? '自信のない牌に「?」が付いています。違う牌だけタップして直してください。'
                : '内容を確認して作成してください。'}
            </p>
            <h2 className="mini-title">手牌</h2>
            <div className="read-row">
              {result.hand.map((c, i) => (
                <ReadCell
                  key={i}
                  cell={c}
                  active={target?.kind === 'hand' && target.i === i}
                  onClick={() => setTarget({ kind: 'hand', i })}
                />
              ))}
            </div>
            {result.melds.length > 0 && (
              <>
                <h2 className="mini-title">鳴き</h2>
                <div className="read-melds">
                  {result.melds.map((g, gi) => {
                    const m = g.every((c) => c.label) ? inferMeld(g) : null;
                    return (
                      <div key={gi} className="read-meld">
                        <div className="read-row read-row--small">
                          {g.map((c, i) => (
                            <ReadCell
                              key={i}
                              cell={c}
                              active={target?.kind === 'meld' && target.g === gi && target.i === i}
                              onClick={() => setTarget({ kind: 'meld', g: gi, i })}
                            />
                          ))}
                        </div>
                        <span className="read-meld__type">
                          {m?.ok
                            ? { chi: 'チー', pon: 'ポン', openKan: '明槓', closedKan: '暗槓', addedKan: '加槓' }[m.meld.type]
                            : '判定できません'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {result.dora.length > 0 && (
              <>
                <h2 className="mini-title">ドラ表示牌</h2>
                <div className="read-row read-row--small">
                  {result.dora.map((c, i) => (
                    <ReadCell
                      key={i}
                      cell={c}
                      active={target?.kind === 'dora' && target.i === i}
                      onClick={() => setTarget({ kind: 'dora', i })}
                    />
                  ))}
                </div>
              </>
            )}
            <dl className="read-summary">
              <div>
                <dt>局</dt>
                <dd>
                  {result.roundWind ? WIND_NAME[result.roundWind] : '—'}
                  {result.handNumber ? `${result.handNumber}局` : ''}
                </dd>
              </div>
              <div>
                <dt>自風</dt>
                <dd>{result.seatWind ? WIND_NAME[result.seatWind] : '—'}</dd>
              </div>
              <div>
                <dt>巡目</dt>
                <dd>{result.turn ?? '—'}</dd>
              </div>
              {(Object.keys(SEAT_NAME) as Seat[])
                .filter((s) => !(result.players === 3 && s === 'across'))
                .map((s) => (
                  <div key={s}>
                    <dt>{SEAT_NAME[s]}</dt>
                    <dd>
                      {result.scores[s]?.toLocaleString() ?? '—'}
                      {result.estimated.includes(s) && <small className="read-summary__est">推定</small>}
                    </dd>
                  </div>
                ))}
            </dl>
            <p className="hint">
              読めなかった点数は合計{result.players === 3 ? '10万5千' : '10万'}
              点から推定し、ほかの読めなかった項目は空欄のまま渡します。作成画面で直せます。
            </p>
          </section>

          {target && current && (
            <section className="panel picker-panel">
              <div className="picker-head">
                <img src={current.preview} alt="選択中の牌" className="picker-crop" />
                <span>この牌を選んでください</span>
                {current.label && !current.sure && (
                  <button type="button" className="btn btn-sm" onClick={acceptAll}>
                    推測どおりでOK
                  </button>
                )}
                <button type="button" className="btn btn-sm" onClick={remove}>
                  牌ではない（除外）
                </button>
              </div>
              <TilePalette onPick={(code) => pick(code)} />
            </section>
          )}

          <section className="panel">{picker}</section>

          {error && <p className="error">{error}</p>}
          <div className="sticky-actions">
            <button type="button" className="btn btn-primary btn-save" onClick={create}>
              この内容で作成
            </button>
          </div>
        </>
      )}
    </div>
  );
}
