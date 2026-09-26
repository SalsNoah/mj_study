import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clearImportDraft, peekImportDraft, setPendingShot } from '@/features/import/draft';
import { useApp } from '@/app/store';
import { HandView } from '@/components/HandView';
import { TilePalette } from '@/components/TilePalette';
import { WanpaiDora } from '@/components/WanpaiDora';
import { contextSummary } from '@/domain/context';
import { createId, nowIso } from '@/domain/ids';
import { buildMeldFromTile } from '@/domain/melds';
import { maybeSortConcealed } from '@/domain/sort';
import {
  emptyContext,
  LIMITS,
  type Meld,
  type MeldFrom,
  type MeldType,
  type Problem,
  type TileCode,
  type Wind,
} from '@/domain/types';
import { hasErrors, standardTileCount, validateProblem } from '@/domain/validate';
import { compressImageFile } from '@/export/renderTiles';

type Target = 'concealed' | 'dora' | 'meld';

const MELD_FROM_OPTS: Array<{ value: MeldFrom; label: string }> = [
  { value: 'left', label: '左家' },
  { value: 'opposite', label: '対面' },
  { value: 'right', label: '右家' },
];

const INPUT_TABS: Array<{ key: Target; label: string; meldType?: MeldType }> = [
  { key: 'concealed', label: '手牌' },
  { key: 'dora', label: 'ドラ表示牌' },
  { key: 'meld', label: '明順子', meldType: 'chi' },
  { key: 'meld', label: '明刻子', meldType: 'pon' },
  { key: 'meld', label: '明槓子', meldType: 'openKan' },
  { key: 'meld', label: '暗槓子', meldType: 'closedKan' },
  { key: 'meld', label: '加槓子', meldType: 'addedKan' },
];

const ROUND_OPTS: Array<{ value: Wind; label: string }> = [
  { value: '1z', label: '東' },
  { value: '2z', label: '南' },
];

const SEAT_OPTS: Array<{ value: Wind; label: string }> = [
  { value: '1z', label: '東' },
  { value: '2z', label: '南' },
  { value: '3z', label: '西' },
  { value: '4z', label: '北' },
];

/** 門前の手牌の上限。副露1組ごとに3枚減る（槓は4枚使うので合計は槓の数だけ14枚を超える）。 */
function handTileMax(meldCount: number): number {
  return Math.max(0, 14 - meldCount * 3);
}

function initialHand(existing?: Problem): TileCode[] {
  if (!existing) return [];
  const merged = existing.drawn
    ? [...existing.concealed, existing.drawn]
    : [...existing.concealed];
  return maybeSortConcealed(merged.slice(0, handTileMax(existing.melds.length)), true);
}

export function EditorPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { store, saveProblem, upsertTag } = useApp();
  const existing = store.problems.find((p) => p.id === id);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [imported] = useState(() => (isNew ? peekImportDraft() : null));
  const [concealed, setConcealed] = useState<TileCode[]>(() =>
    imported
      ? maybeSortConcealed(imported.concealed.slice(0, handTileMax(imported.melds.length)), true)
      : initialHand(existing),
  );
  const [melds, setMelds] = useState<Meld[]>(imported?.melds ?? existing?.melds ?? []);
  const [doraIndicators, setDora] = useState<TileCode[]>(
    imported?.doraIndicators ?? existing?.doraIndicators ?? [],
  );
  const [target, setTarget] = useState<Target>('concealed');
  const [history, setHistory] = useState<Array<() => void>>([]);
  const [answerEnabled, setAnswerEnabled] = useState(existing?.answerEnabled ?? false);
  const [accepted, setAccepted] = useState<TileCode[]>(existing?.acceptedDiscards ?? []);
  const [explanation, setExplanation] = useState(existing?.explanation ?? '');
  const [privateMemo, setPrivateMemo] = useState(existing?.privateMemo ?? '');
  const [tagIds, setTagIds] = useState<string[]>(existing?.tagIds ?? []);
  const [tagInput, setTagInput] = useState('');
  const [context, setContext] = useState(imported?.context ?? existing?.context ?? emptyContext());
  const [attachments, setAttachments] = useState(existing?.attachments ?? []);
  const [sourceUrl, setSourceUrl] = useState(existing?.sourceUrl ?? '');
  const [dirty, setDirty] = useState(!!imported);

  useEffect(() => {
    if (imported) clearImportDraft();
  }, [imported]);
  const [error, setError] = useState<string | null>(null);
  const [warns, setWarns] = useState<string[]>([]);
  const [meldType, setMeldType] = useState<MeldType>('chi');
  const [meldFrom, setMeldFrom] = useState<MeldFrom>('left');
  const [imageMsg, setImageMsg] = useState<string | null>(null);

  const autoSort = store.settings.autoSort;
  const handMax = handTileMax(melds.length);
  const handCount = concealed.length;
  const kanCount = melds.filter((m) => m.tiles.length === 4).length;
  const totalMax = 14 + kanCount;
  const totalCount = concealed.length + melds.reduce((n, m) => n + m.tiles.length, 0);
  const acceptedSet = useMemo(() => new Set(accepted), [accepted]);

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

  const setHand = (tiles: TileCode[], prev: TileCode[]) => {
    const next = maybeSortConcealed(tiles.slice(0, handTileMax(melds.length)), autoSort);
    setConcealed(next);
    pushHistory(() => setConcealed(prev));
  };

  const addTile = (code: TileCode) => {
    mark();
    if (target === 'concealed') {
      if (concealed.length >= handMax) return;
      setHand([...concealed, code], concealed);
    } else if (target === 'dora') {
      if (doraIndicators.length >= LIMITS.doraMax) return;
      const prev = doraIndicators;
      setDora([...doraIndicators, code]);
      pushHistory(() => setDora(prev));
    } else if (target === 'meld') {
      addMeld(code);
    }
  };

  const addMeld = (code: TileCode) => {
    if (melds.length >= LIMITS.meldsMax) {
      setError('副露は最大4組です');
      return;
    }
    if (concealed.length > handTileMax(melds.length + 1)) {
      setError(
        `鳴きを追加すると14枚を超えます。先に手牌を${concealed.length - handTileMax(melds.length + 1)}枚減らしてください`,
      );
      return;
    }
    const built = buildMeldFromTile(meldType, code, meldFrom);
    if (!built.ok) {
      setError(built.reason);
      return;
    }
    const prev = melds;
    setMelds([...melds, built.meld]);
    pushHistory(() => setMelds(prev));
    setError(null);
  };

  const removeMeld = (meldId: string) => {
    mark();
    const prev = melds;
    setMelds(melds.filter((m) => m.id !== meldId));
    pushHistory(() => setMelds(prev));
  };

  const removeConcealedAt = (index: number) => {
    mark();
    setHand(
      concealed.filter((_, i) => i !== index),
      concealed,
    );
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
    setMeldType(type);
    if (type === 'chi') setMeldFrom('left');
  };

  const draftProblem = useMemo((): Problem => {
    const now = nowIso();
    return {
      id: existing?.id ?? createId('prob'),
      title,
      concealed,
      drawn: null,
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

  const countLabel = `${totalCount}/${totalMax}枚${kanCount > 0 ? `（槓+${kanCount}）` : ''}${
    standardTileCount({ concealed, drawn: null, melds }) === 14 ? ' ✓' : ''
  }`;

  return (
    <div className="page page--editor">
      <header className="page-header page-header--compact">
        <h1>{isNew ? '問題を作成' : '問題を編集'}</h1>
        {isNew && (
          <label className="btn btn-sm shot-button">
            スクショから
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setPendingShot(f);
                navigate('/import');
              }}
            />
          </label>
        )}
        <p className="count-pill" aria-live="polite">
          {countLabel}
        </p>
      </header>
      {imported && (
        <p className="ok import-note">
          スクショから読み取りました。違うところがあれば直して保存してください。
          {imported.notes?.map((n) => <span key={n}> {n}</span>)}
        </p>
      )}

      <section className="panel context-panel">
        <div className="ctx-toolbar" aria-label="対局条件">
          <div className="seg" role="group" aria-label="場風">
            {ROUND_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={context.roundWind === o.value ? 'is-on' : ''}
                onClick={() => {
                  setContext({ ...context, roundWind: o.value });
                  mark();
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <label className="ctx-mini">
            <span className="sr-only">局</span>
            <select
              aria-label="局"
              value={context.handNumber ?? ''}
              onChange={(e) => {
                setContext({
                  ...context,
                  handNumber: e.target.value === '' ? null : Number(e.target.value),
                });
                mark();
              }}
            >
              <option value="">局</option>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}局
                </option>
              ))}
            </select>
          </label>
          <div className="seg" role="group" aria-label="自風">
            {SEAT_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={context.seatWind === o.value ? 'is-on' : ''}
                onClick={() => {
                  setContext({ ...context, seatWind: o.value });
                  mark();
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <label className="ctx-mini">
            <span className="sr-only">巡目</span>
            <select
              aria-label="巡目"
              value={context.turn ?? ''}
              onChange={(e) => {
                setContext({
                  ...context,
                  turn: e.target.value === '' ? null : Number(e.target.value),
                });
                mark();
              }}
            >
              <option value="">巡目</option>
              {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}巡
                </option>
              ))}
            </select>
          </label>
          <label className="ctx-mini">
            <span className="sr-only">本場</span>
            <input
              aria-label="本場"
              type="number"
              min={0}
              max={99}
              placeholder="本場"
              value={context.honba ?? ''}
              onChange={(e) => {
                setContext({
                  ...context,
                  honba: e.target.value === '' ? null : Number(e.target.value),
                });
                mark();
              }}
            />
          </label>
          <label className="ctx-mini">
            <span className="sr-only">供託</span>
            <input
              aria-label="供託"
              type="number"
              min={0}
              max={99}
              placeholder="供託"
              value={context.riichiSticks ?? ''}
              onChange={(e) => {
                setContext({
                  ...context,
                  riichiSticks: e.target.value === '' ? null : Number(e.target.value),
                });
                mark();
              }}
            />
          </label>
        </div>
        <div className="ctx-scores" aria-label="点数状況">
          <span className="ctx-scores__label">点数</span>
          {([
            ['east', '東'],
            ['south', '南'],
            ['west', '西'],
            ['north', '北'],
          ] as const).map(([k, label]) => (
            <label key={k} className="ctx-score">
              <span>{label}</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="—"
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
      </section>

      <section className="panel tile-input">
        <div className="hand-stage" aria-label="牌姿プレビュー">
          <div className="hand-stage__top">
            <p className="hand-stage__meta">{contextSummary(context)}</p>
            <WanpaiDora doras={doraIndicators} onRemove={removeDoraAt} />
          </div>
          <HandView
            concealed={concealed}
            drawn={null}
            melds={melds}
            tight
            onSelectConcealed={removeConcealedAt}
            onRemoveMeld={removeMeld}
          />
          {handCount === 0 && melds.length === 0 && (
            <p className="hand-stage__empty">下の牌をタップして入力（鳴き込みで14枚、槓は1枚増）</p>
          )}
        </div>

        <div className="btn-row btn-row--compact">
          <button type="button" className="btn" onClick={doSort}>
            理牌
          </button>
          <button type="button" className="btn" onClick={undo} disabled={!history.length}>
            戻す
          </button>
          <button type="button" className="btn btn-danger" onClick={clearAll}>
            全消去
          </button>
          <span className="count-inline">{countLabel}</span>
        </div>

        <div className="target-tabs target-tabs--scroll" role="tablist" aria-label="入力先">
          {INPUT_TABS.map((tab) => {
            const selected =
              tab.key === 'meld'
                ? target === 'meld' && meldType === tab.meldType
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
                  else setTarget(tab.key);
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {target === 'meld' && (
          <div className="meld-bar">
            {meldType !== 'closedKan' && (
              <div className="seg" role="group" aria-label="取得元">
                {MELD_FROM_OPTS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={meldFrom === o.value ? 'is-on' : ''}
                    disabled={meldType === 'chi' && o.value !== 'left'}
                    onClick={() => setMeldFrom(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            <span className="meld-bar__hint">
              {melds.length >= LIMITS.meldsMax
                ? '副露は4組までです'
                : concealed.length > handTileMax(melds.length + 1)
                  ? `手牌をあと${concealed.length - handTileMax(melds.length + 1)}枚減らすと追加できます`
                  : meldType === 'chi'
                    ? '順子の一番小さい牌をタップ'
                    : '鳴く牌をタップ'}
              ・副露はタップで削除
            </span>
          </div>
        )}

        <TilePalette
          onPick={addTile}
          disabled={
            (target === 'concealed' && handCount >= handMax) ||
            (target === 'dora' && doraIndicators.length >= LIMITS.doraMax) ||
            (target === 'meld' &&
              (melds.length >= LIMITS.meldsMax ||
                concealed.length > handTileMax(melds.length + 1)))
          }
        />
        {error && target === 'meld' && <p className="error">{error}</p>}
      </section>

      <label className="field">
        <span>タイトル（任意）</span>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            mark();
          }}
          maxLength={LIMITS.title}
        />
      </label>

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
            <p className="hint">切るのが正解の牌をタップ（複数可・もう一度で解除）</p>
            <div className="hand-stage hand-stage--pick">
              <HandView
                concealed={concealed}
                drawn={null}
                melds={melds}
                tight
                selectablePool="concealedDrawn"
                marks={new Map(accepted.map((c) => [c, 'correct' as const]))}
                onSelectCode={(c) => {
                  setAccepted((a) =>
                    acceptedSet.has(c) ? a.filter((x) => x !== c) : [...a, c],
                  );
                  mark();
                }}
              />
            </div>
          </div>
        )}
        <label className="field">
          <span>解説</span>
          <textarea
            value={explanation}
            onChange={(e) => {
              setExplanation(e.target.value);
              mark();
            }}
            rows={3}
            maxLength={LIMITS.explanation}
          />
        </label>
        <label className="field">
          <span>自分のメモ（共有されません）</span>
          <textarea
            value={privateMemo}
            onChange={(e) => {
              setPrivateMemo(e.target.value);
              mark();
            }}
            rows={2}
            maxLength={LIMITS.privateMemo}
          />
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
                      on
                        ? ids.filter((x) => x !== t.id)
                        : ids.length < LIMITS.tagsPerProblem
                          ? [...ids, t.id]
                          : ids,
                    );
                    mark();
                  }}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
          <div className="btn-row btn-row--compact">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="新しいタグ"
              maxLength={LIMITS.tagName}
            />
            <button type="button" className="btn" onClick={addTag}>
              追加
            </button>
          </div>
        </div>
      </section>

      <details className="details panel">
        <summary>参考資料</summary>
        <label className="field">
          <span>出典URL</span>
          <input
            value={sourceUrl}
            onChange={(e) => {
              setSourceUrl(e.target.value);
              mark();
            }}
            placeholder="https://"
          />
        </label>
        <label className="field">
          <span>参考画像（最大3枚）</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => onImage(e.target.files?.[0] ?? null)}
          />
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
        <p key={w} className="warn">
          {w}
        </p>
      ))}
      {error && <p className="error">{error}</p>}

      <div className="sticky-actions">
        <button type="button" className="btn btn-primary btn-save" onClick={save}>
          保存
        </button>
      </div>
    </div>
  );
}
