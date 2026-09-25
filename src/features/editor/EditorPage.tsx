import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '@/app/store';
import { HandView } from '@/components/HandView';
import { TilePalette } from '@/components/TilePalette';
import { TileFace } from '@/components/TileFace';
import { createId, nowIso } from '@/domain/ids';
import { createMeld } from '@/domain/melds';
import { maybeSortConcealed } from '@/domain/sort';
import { emptyContext, LIMITS, type Meld, type MeldFrom, type MeldType, type Problem, type TileCode } from '@/domain/types';
import { hasErrors, standardTileCount, validateProblem } from '@/domain/validate';
import { compressImageFile } from '@/export/renderTiles';

type Target = 'concealed' | 'dora' | 'meld';

type MeldDraft = {
  type: MeldType;
  tiles: TileCode[];
  from: MeldFrom | null;
  calledIndex: number | null;
};

const INPUT_TABS: Array<{ key: Target; label: string; meldType?: MeldType }> = [
  { key: 'concealed', label: '手牌' },
  { key: 'dora', label: 'ドラ表示牌' },
  { key: 'meld', label: '明順子', meldType: 'chi' },
  { key: 'meld', label: '明刻子', meldType: 'pon' },
  { key: 'meld', label: '明槓子', meldType: 'openKan' },
  { key: 'meld', label: '暗槓子', meldType: 'closedKan' },
  { key: 'meld', label: '加槓子', meldType: 'addedKan' },
];

/** 手牌+ツモの上限（副露1組=3枚相当） */
function liveTileMax(meldCount: number): number {
  return Math.max(0, 14 - meldCount * 3);
}

/** 14枚相当になったら末尾をツモ、それ未満はすべて手牌 */
function splitLiveTiles(
  tiles: TileCode[],
  meldCount: number,
  autoSort: boolean,
): { concealed: TileCode[]; drawn: TileCode | null } {
  const max = liveTileMax(meldCount);
  const clipped = tiles.slice(0, max);
  if (clipped.length === max && max > 0) {
    return {
      concealed: maybeSortConcealed(clipped.slice(0, -1), autoSort),
      drawn: clipped[clipped.length - 1]!,
    };
  }
  return {
    concealed: maybeSortConcealed(clipped, autoSort),
    drawn: null,
  };
}

export function EditorPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { store, saveProblem, upsertTag } = useApp();
  const existing = store.problems.find((p) => p.id === id);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [concealed, setConcealed] = useState<TileCode[]>(existing?.concealed ?? []);
  const [drawn, setDrawn] = useState<TileCode | null>(existing?.drawn ?? null);
  const [melds, setMelds] = useState<Meld[]>(existing?.melds ?? []);
  const [doraIndicators, setDora] = useState<TileCode[]>(existing?.doraIndicators ?? []);
  const [target, setTarget] = useState<Target>('concealed');
  const [history, setHistory] = useState<Array<() => void>>([]);
  const [answerEnabled, setAnswerEnabled] = useState(existing?.answerEnabled ?? false);
  const [accepted, setAccepted] = useState<TileCode[]>(existing?.acceptedDiscards ?? []);
  const [explanation, setExplanation] = useState(existing?.explanation ?? '');
  const [privateMemo, setPrivateMemo] = useState(existing?.privateMemo ?? '');
  const [tagIds, setTagIds] = useState<string[]>(existing?.tagIds ?? []);
  const [tagInput, setTagInput] = useState('');
  const [context, setContext] = useState(existing?.context ?? emptyContext());
  const [attachments, setAttachments] = useState(existing?.attachments ?? []);
  const [sourceUrl, setSourceUrl] = useState(existing?.sourceUrl ?? '');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warns, setWarns] = useState<string[]>([]);
  const [meldDraft, setMeldDraft] = useState<MeldDraft | null>(null);
  const [activeMeldType, setActiveMeldType] = useState<MeldType>('chi');
  const [imageMsg, setImageMsg] = useState<string | null>(null);

  const autoSort = store.settings.autoSort;
  const liveMax = liveTileMax(melds.length);
  const liveCount = concealed.length + (drawn ? 1 : 0);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const mark = useCallback(() => setDirty(true), []);

  const pushHistory = (undo: () => void) => {
    setHistory((h) => [...h.slice(-49), undo]);
  };

  const applyLive = (tiles: TileCode[], prevConcealed: TileCode[], prevDrawn: TileCode | null) => {
    const next = splitLiveTiles(tiles, melds.length, autoSort);
    setConcealed(next.concealed);
    setDrawn(next.drawn);
    pushHistory(() => {
      setConcealed(prevConcealed);
      setDrawn(prevDrawn);
    });
  };

  const addTile = (code: TileCode) => {
    mark();
    if (target === 'concealed') {
      if (liveCount >= liveMax) return;
      const live: TileCode[] = [...concealed];
      if (drawn) live.push(drawn);
      applyLive([...live, code], concealed, drawn);
    } else if (target === 'dora') {
      if (doraIndicators.length >= LIMITS.doraMax) return;
      const prev = doraIndicators;
      setDora([...doraIndicators, code]);
      pushHistory(() => setDora(prev));
    } else if (target === 'meld' && meldDraft) {
      const need = meldDraft.type === 'chi' || meldDraft.type === 'pon' ? 3 : 4;
      if (meldDraft.tiles.length >= need) return;
      setMeldDraft({ ...meldDraft, tiles: [...meldDraft.tiles, code] });
    }
  };

  const removeConcealedAt = (index: number) => {
    mark();
    const live: TileCode[] = concealed.filter((_, i) => i !== index);
    if (drawn) live.push(drawn);
    applyLive(live, concealed, drawn);
  };

  const removeDrawn = () => {
    if (!drawn) return;
    mark();
    applyLive([...concealed], concealed, drawn);
  };

  const removeDoraAt = (index: number) => {
    mark();
    const prev = doraIndicators;
    setDora(doraIndicators.filter((_, i) => i !== index));
    pushHistory(() => setDora(prev));
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    last();
    setHistory((h) => h.slice(0, -1));
    mark();
  };

  const clearAll = () => {
    if (!window.confirm('入力中の牌をすべて消しますか？')) return;
    setConcealed([]);
    setDrawn(null);
    setMelds([]);
    setDora([]);
    setAccepted([]);
    mark();
  };

  const doSort = () => {
    const prev = concealed;
    setConcealed(maybeSortConcealed(concealed, true));
    pushHistory(() => setConcealed(prev));
    mark();
  };

  const startMeldTab = (type: MeldType) => {
    setTarget('meld');
    setActiveMeldType(type);
    setMeldDraft({
      type,
      tiles: [],
      from: type === 'closedKan' ? null : 'left',
      calledIndex: type === 'closedKan' ? null : 0,
    });
  };

  const draftProblem = useMemo((): Problem => {
    const now = nowIso();
    return {
      id: existing?.id ?? createId('prob'),
      title,
      concealed,
      drawn,
      melds,
      doraIndicators,
      answerEnabled,
      acceptedDiscards: answerEnabled ? accepted : [],
      explanation,
      privateMemo,
      tagIds,
      context,
      attachments,
      sourceUrl,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }, [
    existing,
    title,
    concealed,
    drawn,
    melds,
    doraIndicators,
    answerEnabled,
    accepted,
    explanation,
    privateMemo,
    tagIds,
    context,
    attachments,
    sourceUrl,
  ]);

  const save = () => {
    const issues = validateProblem(draftProblem);
    setWarns(issues.filter((i) => i.level === 'warn').map((i) => i.message));
    if (hasErrors(issues)) {
      setError(issues.filter((i) => i.level === 'error').map((i) => i.message).join(' / '));
      return;
    }
    const result = saveProblem(draftProblem, isNew || !existing);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setDirty(false);
    setError(null);
    navigate(`/problems/${draftProblem.id}`);
  };

  const confirmMeld = () => {
    if (!meldDraft) return;
    const created = createMeld(
      meldDraft.type,
      meldDraft.tiles,
      meldDraft.from,
      meldDraft.calledIndex,
      meldDraft.type === 'addedKan' ? meldDraft.calledIndex : null,
    );
    if (!created.ok) {
      setError(created.reason);
      return;
    }
    if (melds.length >= LIMITS.meldsMax) {
      setError('副露は最大4組です');
      return;
    }
    const nextMelds = [...melds, created.meld];
    setMelds(nextMelds);
    const live: TileCode[] = [...concealed];
    if (drawn) live.push(drawn);
    const split = splitLiveTiles(live, nextMelds.length, autoSort);
    setConcealed(split.concealed);
    setDrawn(split.drawn);
    setMeldDraft({
      type: activeMeldType,
      tiles: [],
      from: activeMeldType === 'closedKan' ? null : 'left',
      calledIndex: activeMeldType === 'closedKan' ? null : 0,
    });
    mark();
    setError(null);
  };

  const onImage = async (file: File | null) => {
    if (!file) return;
    if (attachments.length >= LIMITS.attachmentsMax) {
      setImageMsg(`参考画像は${LIMITS.attachmentsMax}枚までです`);
      return;
    }
    const result = await compressImageFile(file);
    if (!result.ok) {
      setImageMsg(result.reason);
      return;
    }
    setAttachments([
      ...attachments,
      { id: createId('att'), dataUrl: result.dataUrl, width: result.width, height: result.height },
    ]);
    setImageMsg(null);
    mark();
  };

  const addTag = () => {
    const r = upsertTag(tagInput);
    if (!r.ok) {
      setError(r.reason);
      return;
    }
    if ('tag' in r && !tagIds.includes(r.tag.id) && tagIds.length < LIMITS.tagsPerProblem) {
      setTagIds([...tagIds, r.tag.id]);
      setTagInput('');
      mark();
    }
  };

  const pool = useMemo(() => {
    const list = [...concealed];
    if (drawn) list.push(drawn);
    return list;
  }, [concealed, drawn]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>{isNew ? '問題を作成' : '問題を編集'}</h1>
      </header>

      <label className="field">
        <span>タイトル（任意）</span>
        <input value={title} onChange={(e) => { setTitle(e.target.value); mark(); }} maxLength={LIMITS.title} />
      </label>

      <section className="panel tile-input">
        <h2 className="section-title">牌入力</h2>
        <p className="hint">
          牌ボタンで追加します。手牌が {liveMax} 枚（14枚形）になると末尾がツモになります。
          現在 {liveCount}/{liveMax} 枚
          {standardTileCount({ concealed, drawn, melds }) === 14 ? '（14枚形）' : ''}。
        </p>

        <div className="hand-stage" aria-label="牌姿プレビュー">
          {doraIndicators.length > 0 && (
            <div className="dora-row">
              <span>ドラ表示牌</span>
              <div className="tile-row">
                {doraIndicators.map((c, i) => (
                  <TileFace key={i} code={c} size={32} onClick={() => removeDoraAt(i)} />
                ))}
              </div>
            </div>
          )}
          <HandView
            concealed={concealed}
            drawn={drawn}
            melds={melds}
            size={42}
            onSelectConcealed={removeConcealedAt}
            onSelectDrawn={removeDrawn}
          />
          {liveCount === 0 && melds.length === 0 && (
            <p className="hand-stage__empty">下の牌をクリックして手牌を入力</p>
          )}
        </div>

        <div className="btn-row">
          <button type="button" className="btn" onClick={doSort}>理牌</button>
          <button type="button" className="btn" onClick={undo} disabled={!history.length}>戻す</button>
          <button type="button" className="btn btn-danger" onClick={clearAll}>全消去</button>
        </div>

        <div className="target-tabs target-tabs--scroll" role="tablist" aria-label="入力先">
          {INPUT_TABS.map((tab) => {
            const selected =
              tab.key === 'meld'
                ? target === 'meld' && activeMeldType === tab.meldType
                : target === tab.key;
            return (
              <button
                key={`${tab.label}-${tab.meldType ?? tab.key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                className={selected ? 'is-active' : ''}
                onClick={() => {
                  if (tab.key === 'meld' && tab.meldType) startMeldTab(tab.meldType);
                  else {
                    setTarget(tab.key);
                    setMeldDraft(null);
                  }
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {target === 'meld' && meldDraft && (
          <div className="meld-draft">
            <p className="hint">
              {meldDraft.type === 'chi' && 'チーは3枚。左家からのみ。鳴き位置を指定して確定。'}
              {meldDraft.type === 'pon' && 'ポンは同牌3枚。取得元と鳴き位置を指定。'}
              {(meldDraft.type === 'openKan' || meldDraft.type === 'closedKan' || meldDraft.type === 'addedKan') &&
                '槓は同牌4枚。'}
            </p>
            {meldDraft.type !== 'closedKan' && (
              <div className="field-row">
                <label className="field">
                  <span>取得元</span>
                  <select
                    value={meldDraft.from ?? 'left'}
                    onChange={(e) =>
                      setMeldDraft({ ...meldDraft, from: e.target.value as MeldFrom })
                    }
                    disabled={meldDraft.type === 'chi'}
                  >
                    <option value="left">左家</option>
                    <option value="opposite">対面</option>
                    <option value="right">右家</option>
                  </select>
                </label>
                <label className="field">
                  <span>鳴き位置</span>
                  <input
                    type="number"
                    min={0}
                    max={3}
                    value={meldDraft.calledIndex ?? 0}
                    onChange={(e) =>
                      setMeldDraft({ ...meldDraft, calledIndex: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
            )}
            <div className="tile-row">
              {meldDraft.tiles.map((c, i) => (
                <TileFace key={i} code={c} size={36} />
              ))}
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={confirmMeld}>
                副露を確定
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setMeldDraft({ ...meldDraft, tiles: [] })}
              >
                牌をクリア
              </button>
            </div>
            {melds.map((m) => (
              <div key={m.id} className="btn-row">
                <span>{m.type}</span>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    const nextMelds = melds.filter((x) => x.id !== m.id);
                    setMelds(nextMelds);
                    const live: TileCode[] = [...concealed];
                    if (drawn) live.push(drawn);
                    const split = splitLiveTiles(live, nextMelds.length, autoSort);
                    setConcealed(split.concealed);
                    setDrawn(split.drawn);
                    mark();
                  }}
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}

        <TilePalette
          onPick={addTile}
          disabled={
            (target === 'concealed' && liveCount >= liveMax) ||
            (target === 'dora' && doraIndicators.length >= LIMITS.doraMax) ||
            (target === 'meld' &&
              !!meldDraft &&
              meldDraft.tiles.length >= (meldDraft.type === 'chi' || meldDraft.type === 'pon' ? 3 : 4))
          }
        />
      </section>

      <section className="panel">
        <label className="check">
          <input
            type="checkbox"
            checked={answerEnabled}
            onChange={(e) => {
              setAnswerEnabled(e.target.checked);
              if (!e.target.checked) setAccepted([]);
              mark();
            }}
          />
          正解を設定する
        </label>
        {answerEnabled && (
          <div>
            <p className="hint">手牌・ツモから正解牌を選択（複数可。副露は不可）</p>
            <div className="tile-row tile-row--wrap">
              {pool.map((c, i) => {
                const on = accepted.includes(c);
                return (
                  <TileFace
                    key={`${c}-${i}`}
                    code={c}
                    size={36}
                    selected={on}
                    onClick={() => {
                      setAccepted((a) =>
                        on ? a.filter((x) => x !== c) : [...a, c],
                      );
                      mark();
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}
        <label className="field">
          <span>解説</span>
          <textarea value={explanation} onChange={(e) => { setExplanation(e.target.value); mark(); }} rows={4} maxLength={LIMITS.explanation} />
        </label>
        <label className="field">
          <span>自分のメモ（共有されません）</span>
          <textarea value={privateMemo} onChange={(e) => { setPrivateMemo(e.target.value); mark(); }} rows={3} maxLength={LIMITS.privateMemo} />
        </label>
        <div className="field">
          <span>タグ</span>
          <div className="tag-cloud">
            {store.tags.map((t) => {
              const on = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`tag-chip${on ? ' is-on' : ''}`}
                  onClick={() => {
                    setTagIds((ids) =>
                      on ? ids.filter((x) => x !== t.id) : ids.length < LIMITS.tagsPerProblem ? [...ids, t.id] : ids,
                    );
                    mark();
                  }}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
          <div className="btn-row">
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="新しいタグ" maxLength={LIMITS.tagName} />
            <button type="button" className="btn" onClick={addTag}>追加</button>
          </div>
        </div>
      </section>

      <details className="details panel">
        <summary>対局条件</summary>
        <div className="field-row">
          <label className="field">
            <span>場風</span>
            <select
              value={context.roundWind ?? ''}
              onChange={(e) => {
                setContext({ ...context, roundWind: (e.target.value || null) as Problem['context']['roundWind'] });
                mark();
              }}
            >
              <option value="">未入力</option>
              <option value="1z">東</option>
              <option value="2z">南</option>
              <option value="3z">西</option>
              <option value="4z">北</option>
            </select>
          </label>
          <label className="field">
            <span>局</span>
            <input
              type="number"
              min={1}
              max={4}
              value={context.handNumber ?? ''}
              onChange={(e) => {
                setContext({
                  ...context,
                  handNumber: e.target.value === '' ? null : Number(e.target.value),
                });
                mark();
              }}
            />
          </label>
          <label className="field">
            <span>自風</span>
            <select
              value={context.seatWind ?? ''}
              onChange={(e) => {
                setContext({ ...context, seatWind: (e.target.value || null) as Problem['context']['seatWind'] });
                mark();
              }}
            >
              <option value="">未入力</option>
              <option value="1z">東</option>
              <option value="2z">南</option>
              <option value="3z">西</option>
              <option value="4z">北</option>
            </select>
          </label>
          <label className="field">
            <span>巡目</span>
            <input type="number" min={1} max={30} value={context.turn ?? ''} onChange={(e) => { setContext({ ...context, turn: e.target.value === '' ? null : Number(e.target.value) }); mark(); }} />
          </label>
          <label className="field">
            <span>本場</span>
            <input type="number" min={0} max={99} value={context.honba ?? ''} onChange={(e) => { setContext({ ...context, honba: e.target.value === '' ? null : Number(e.target.value) }); mark(); }} />
          </label>
          <label className="field">
            <span>供託</span>
            <input type="number" min={0} max={99} value={context.riichiSticks ?? ''} onChange={(e) => { setContext({ ...context, riichiSticks: e.target.value === '' ? null : Number(e.target.value) }); mark(); }} />
          </label>
          <label className="field">
            <span>自分の順位</span>
            <input type="number" min={1} max={4} value={context.ownRank ?? ''} onChange={(e) => { setContext({ ...context, ownRank: e.target.value === '' ? null : Number(e.target.value) }); mark(); }} />
          </label>
        </div>
        <div className="field-row">
          {(['east', 'south', 'west', 'north'] as const).map((k) => (
            <label key={k} className="field">
              <span>{k}点</span>
              <input
                type="number"
                value={context.scores[k] ?? ''}
                onChange={(e) => {
                  setContext({
                    ...context,
                    scores: {
                      ...context.scores,
                      [k]: e.target.value === '' ? null : Number(e.target.value),
                    },
                  });
                  mark();
                }}
              />
            </label>
          ))}
        </div>
      </details>

      <details className="details panel">
        <summary>参考資料</summary>
        <label className="field">
          <span>出典URL</span>
          <input value={sourceUrl} onChange={(e) => { setSourceUrl(e.target.value); mark(); }} placeholder="https://" />
        </label>
        <label className="field">
          <span>参考画像（最大3枚）</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onImage(e.target.files?.[0] ?? null)} />
        </label>
        {imageMsg && <p className="error">{imageMsg}</p>}
        <div className="attach-grid">
          {attachments.map((a) => (
            <div key={a.id} className="attach-item">
              <img src={a.dataUrl} alt="参考画像" />
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setAttachments(attachments.filter((x) => x.id !== a.id));
                  mark();
                }}
              >
                削除
              </button>
            </div>
          ))}
        </div>
      </details>

      {warns.map((w) => (
        <p key={w} className="warn">{w}</p>
      ))}
      {error && <p className="error">{error}</p>}

      <div className="sticky-actions">
        <button type="button" className="btn btn-primary" onClick={save}>
          保存
        </button>
      </div>
    </div>
  );
}
