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
import { hasErrors, validateProblem } from '@/domain/validate';
import { compressImageFile } from '@/export/renderTiles';

type Target = 'concealed' | 'drawn' | 'dora' | 'meld';

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
  const [selectedConcealed, setSelectedConcealed] = useState<number | null>(null);
  const [meldDraft, setMeldDraft] = useState<{
    type: MeldType;
    tiles: TileCode[];
    from: MeldFrom | null;
    calledIndex: number | null;
  } | null>(null);
  const [imageMsg, setImageMsg] = useState<string | null>(null);

  const autoSort = store.settings.autoSort;

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

  const addTile = (code: TileCode) => {
    mark();
    if (target === 'concealed') {
      if (concealed.length >= LIMITS.concealedMax) return;
      const prev = concealed;
      const next = maybeSortConcealed([...concealed, code], autoSort);
      setConcealed(next);
      pushHistory(() => setConcealed(prev));
    } else if (target === 'drawn') {
      const prev = drawn;
      setDrawn(code);
      pushHistory(() => setDrawn(prev));
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
    setMelds([...melds, created.meld]);
    setMeldDraft(null);
    setTarget('concealed');
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

      <div className="target-tabs" role="tablist" aria-label="入力先">
        {(
          [
            ['concealed', '手牌'],
            ['drawn', 'ツモ'],
            ['meld', '副露'],
            ['dora', 'ドラ表示牌'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={target === key}
            className={target === key ? 'is-active' : ''}
            onClick={() => {
              setTarget(key);
              if (key === 'meld' && !meldDraft) {
                setMeldDraft({ type: 'chi', tiles: [], from: 'left', calledIndex: 0 });
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="panel">
        <h2 className="section-title">牌姿</h2>
        <HandView concealed={concealed} drawn={drawn} melds={melds} size={40} />
        {doraIndicators.length > 0 && (
          <div className="dora-row">
            <span>ドラ表示牌</span>
            <div className="tile-row">
              {doraIndicators.map((c, i) => (
                <TileFace key={i} code={c} size={32} />
              ))}
            </div>
          </div>
        )}
        <div className="btn-row">
          <button type="button" className="btn" onClick={doSort}>理牌</button>
          <button type="button" className="btn" onClick={undo} disabled={!history.length}>戻す</button>
          <button type="button" className="btn btn-danger" onClick={clearAll}>全消去</button>
        </div>
        {selectedConcealed !== null && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              const prev = concealed;
              setConcealed(concealed.filter((_, i) => i !== selectedConcealed));
              pushHistory(() => setConcealed(prev));
              setSelectedConcealed(null);
              mark();
            }}
          >
            選択した手牌を削除
          </button>
        )}
        <div className="tile-row tile-row--scroll" style={{ marginTop: 8 }}>
          {concealed.map((c, i) => (
            <TileFace
              key={`${c}-${i}`}
              code={c}
              size={36}
              selected={selectedConcealed === i}
              onClick={() => setSelectedConcealed(i)}
            />
          ))}
        </div>
      </section>

      {target === 'meld' && meldDraft && (
        <section className="panel">
          <h2 className="section-title">副露入力</h2>
          <label className="field">
            <span>種類</span>
            <select
              value={meldDraft.type}
              onChange={(e) =>
                setMeldDraft({
                  ...meldDraft,
                  type: e.target.value as MeldType,
                  tiles: [],
                  from: e.target.value === 'closedKan' ? null : meldDraft.from ?? 'left',
                  calledIndex: e.target.value === 'closedKan' ? null : 0,
                })
              }
            >
              <option value="chi">チー</option>
              <option value="pon">ポン</option>
              <option value="openKan">明槓</option>
              <option value="closedKan">暗槓</option>
              <option value="addedKan">加槓</option>
            </select>
          </label>
          {meldDraft.type !== 'closedKan' && (
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
          )}
          <label className="field">
            <span>鳴いた牌の位置（0始まり）</span>
            <input
              type="number"
              min={0}
              max={3}
              value={meldDraft.calledIndex ?? 0}
              disabled={meldDraft.type === 'closedKan'}
              onChange={(e) =>
                setMeldDraft({ ...meldDraft, calledIndex: Number(e.target.value) })
              }
            />
          </label>
          <div className="tile-row">
            {meldDraft.tiles.map((c, i) => (
              <TileFace key={i} code={c} size={36} />
            ))}
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={confirmMeld}>
              副露を確定
            </button>
            <button type="button" className="btn" onClick={() => setMeldDraft({ ...meldDraft, tiles: [] })}>
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
                  setMelds(melds.filter((x) => x.id !== m.id));
                  mark();
                }}
              >
                削除
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <h2 className="section-title">牌パレット</h2>
        <TilePalette onPick={addTile} />
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
