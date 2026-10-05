import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clearImportDraft, peekImportDraft, setPendingShot } from '@/features/import/draft';
import { useApp } from '@/app/store';
import { HandView } from '@/components/HandView';
import { AttachmentEditor } from '@/components/AttachmentEditor';
import type { AttachmentRole } from '@/domain/attachments';
import { TilePalette } from '@/components/TilePalette';
import { RemainingButton, RemainingSettings, UkeireResults } from '@/components/UkeirePanel';
import { parseScoreInput, scoreEntryFromValue } from '@/domain/scoreInput';
import { useUkeireSession } from '@/components/useUkeireSession';
import { WanpaiDora } from '@/components/WanpaiDora';
import { contextSummary } from '@/domain/context';
import { createId, nowIso } from '@/domain/ids';
import { buildMeldFromTile } from '@/domain/melds';
import { allTiles } from '@/domain/tiles';
import { tileAdditionIssue, tileSupplyIssues } from '@/domain/tileSupply';
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

const SCORE_FIELDS = [['east', '東'], ['south', '南'], ['west', '西'], ['north', '北']] as const;
type ScoreKey = typeof SCORE_FIELDS[number][0];

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

/** New manual entries only. A north indicator makes east the actual dora. */
function initialContext() {
  return { ...emptyContext(), roundWind: '1z' as Wind, handNumber: 1, seatWind: '1z' as Wind,
    turn: 6, scores: { east: 25000, south: 25000, west: 25000, north: 25000 } };
}

function initialHand(existing?: Problem): TileCode[] {
  if (!existing) return [];
  const merged = existing.drawn
    ? [...existing.concealed, existing.drawn]
    : [...existing.concealed];
  return maybeSortConcealed(merged, true);
}

export function EditorPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { store, saveProblem, upsertTag } = useApp();
  const existing = store.problems.find((p) => p.id === id);

  const [title, setTitle] = useState(existing?.title ?? '');
  const titleField = useRef<HTMLInputElement | null>(null);
  const screenshotInput = useRef<HTMLInputElement | null>(null);
  const [imported] = useState(() => (isNew ? peekImportDraft() : null));
  const [concealed, setConcealed] = useState<TileCode[]>(() =>
    imported
      ? maybeSortConcealed([...imported.concealed], true)
      : initialHand(existing),
  );
  const [melds, setMelds] = useState<Meld[]>(imported?.melds ?? existing?.melds ?? []);
  const [doraIndicators, setDora] = useState<TileCode[]>(
    imported?.doraIndicators ?? existing?.doraIndicators ?? (isNew ? ['4z'] : []),
  );
  const ukeire = useUkeireSession({ concealed, drawn: null, melds, doraIndicators }, existing?.id ?? 'new');
  const [notesOpen, setNotesOpen] = useState(false);
  const [target, setTarget] = useState<Target>('concealed');
  const [history, setHistory] = useState<Array<() => void>>([]);
  const [answerEnabled, setAnswerEnabled] = useState(existing?.answerEnabled ?? false);
  const [inTest, setInTest] = useState(() => store.study.find((s) => s.problemId === existing?.id)?.inTest !== false);
  const [accepted, setAccepted] = useState<TileCode[]>(existing?.acceptedDiscards ?? []);
  const [explanation, setExplanation] = useState(existing?.explanation ?? '');
  const [privateMemo, setPrivateMemo] = useState(existing?.privateMemo ?? '');
  const [tagIds, setTagIds] = useState<string[]>(existing?.tagIds ?? []);
  const [tagInput, setTagInput] = useState('');
  const [context, setContext] = useState(imported?.context ?? existing?.context ?? (isNew ? initialContext() : emptyContext()));
  const scoreFields = useRef<Partial<Record<ScoreKey, HTMLInputElement | null>>>({});
  const [scoreInputs, setScoreInputs] = useState(() => ({
    east: scoreEntryFromValue(context.scores.east), south: scoreEntryFromValue(context.scores.south),
    west: scoreEntryFromValue(context.scores.west), north: scoreEntryFromValue(context.scores.north),
  }));
  const [attachments, setAttachments] = useState(existing?.attachments ?? []);
  const [imageBusy, setImageBusy] = useState(false);
  const imageUploadLock = useRef(false);
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
  const knownTiles = useMemo(() => [...concealed, ...melds.flatMap((m) => m.tiles), ...doraIndicators], [concealed, melds, doraIndicators]);
  const supplyIssues = useMemo(() => tileSupplyIssues(knownTiles), [knownTiles]);
  const blockedReasons = useMemo(() => {
    const reasons: Partial<Record<TileCode, string>> = {};
    for (const code of allTiles()) {
      let reason: string | null = null;
      if (target === 'concealed' && concealed.length >= handMax) reason = `手牌はこの副露構成では最大${handMax}枚です。先に手牌を減らしてください。`;
      else if (target === 'dora' && doraIndicators.length >= LIMITS.doraMax) reason = 'ドラ表示牌は最大5枚です。先に表示牌を減らしてください。';
      else if (target === 'meld') {
        if (melds.length >= LIMITS.meldsMax) reason = '副露は最大4組です。';
        else if (concealed.length > handTileMax(melds.length + 1)) reason = `先に手牌を${concealed.length - handTileMax(melds.length + 1)}枚減らしてください。`;
        else {
          const candidate = buildMeldFromTile(meldType, code, meldFrom);
          reason = candidate.ok ? tileAdditionIssue(knownTiles, candidate.meld.tiles) : candidate.reason;
        }
      } else reason = tileAdditionIssue(knownTiles, [code]);
      if (reason) reasons[code] = reason;
    }
    return reasons;
  }, [knownTiles, concealed.length, handMax, doraIndicators.length, melds.length, target, meldType, meldFrom]);


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
    setError(null);
    const next = maybeSortConcealed(tiles, autoSort);
    setConcealed(next);
    pushHistory(() => setConcealed(prev));
  };

  const addTile = (code: TileCode) => {
    if (blockedReasons[code]) { setError(blockedReasons[code]!); return; }
    setError(null);
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
    const supplyError = tileAdditionIssue(knownTiles, built.meld.tiles);
    if (supplyError) { setError(supplyError); return; }
    const prev = melds;
    setMelds([...melds, built.meld]);
    pushHistory(() => setMelds(prev));
    setError(null);
  };

  const removeMeld = (meldId: string) => {
    setError(null);
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
    setError(null);
    mark();
    const prev = doraIndicators;
    setDora(doraIndicators.filter((_, i) => i !== index));
    pushHistory(() => setDora(prev));
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    last();
    setError(null);
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
    if (imageUploadLock.current) { setError('画像の準備が終わるまでお待ちください。'); return; }
    if (SCORE_FIELDS.some(([key]) => scoreInputs[key].error)) {
      setError('点数に未反映の入力があります。修正してから保存してください。');
      return;
    }
    const issues = validateProblem(draftProblem);
    setWarns(issues.filter((i) => i.level === 'warn').map((i) => i.message));
    if (hasErrors(issues)) {
      const first = issues.find((issue) => issue.level === 'error')!.code;
      if (first === 'title_len') titleField.current?.focus();
      if (['explanation_len', 'memo_len', 'tags_per', 'attach_max', 'answer_empty', 'answer_missing', 'bad_url'].includes(first)) setNotesOpen(true);
      setError(issues.filter((i) => i.level === 'error').map((i) => i.message).join(' / '));
      return;
    }
    const result = saveProblem(draftProblem, isNew || !existing, inTest);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setDirty(false);
    setError(null);
    navigate(`/problems/${draftProblem.id}`);
  };

  const onImage = async (file: File | null, role: AttachmentRole) => {
    if (!file || imageUploadLock.current) return;
    if (attachments.length >= LIMITS.attachmentsMax) {
      setImageMsg(`参考画像は${LIMITS.attachmentsMax}枚までです`);
      return;
    }
    imageUploadLock.current = true;
    setImageBusy(true);
    try {
      const result = await compressImageFile(file);
      if (!result.ok) { setImageMsg(result.reason); return; }
      setAttachments((current) => [...current,
        { id: createId('att'), dataUrl: result.dataUrl, width: result.width, height: result.height, role },
      ]);
      setImageMsg(null);
      mark();
    } finally {
      imageUploadLock.current = false;
      setImageBusy(false);
    }
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

  const changeScore = (key: ScoreKey, draft: string) => {
    const mode = scoreInputs[key].mode;
    const parsed = parseScoreInput(draft, mode);
    setScoreInputs((previous) => ({ ...previous, [key]: { draft, mode, error: parsed.ok ? null : parsed.error } }));
    if (parsed.ok) setContext((previous) => ({ ...previous, scores: { ...previous.scores, [key]: parsed.value } }));
    setError(null);
    mark();
  };
  const normalizeScore = (key: ScoreKey) => {
    const parsed = parseScoreInput(scoreInputs[key].draft, scoreInputs[key].mode);
    if (parsed.ok) setScoreInputs((previous) => ({ ...previous, [key]: scoreEntryFromValue(parsed.value) }));
  };
  const resetScoreDraft = (key: ScoreKey) => {
    setScoreInputs((previous) => ({ ...previous, [key]: scoreEntryFromValue(context.scores[key]) }));
    setError(null);
    scoreFields.current[key]?.focus();
  };
  const adoptExactScore = (key: ScoreKey) => {
    const parsed = parseScoreInput(scoreInputs[key].draft, 'exact');
    if (!parsed.ok || parsed.value === null) return;
    setContext((previous) => ({ ...previous, scores: { ...previous.scores, [key]: parsed.value } }));
    setScoreInputs((previous) => ({ ...previous, [key]: scoreEntryFromValue(parsed.value) }));
    setError(null);
    mark();
    scoreFields.current[key]?.focus();
  };

  const countLabel = `${totalCount}/${totalMax}枚${kanCount > 0 ? `（槓+${kanCount}）` : ''}${
    standardTileCount({ concealed, drawn: null, melds }) === 14 ? ' ✓' : ''
  }`;

  const mainPane = (
      <div key="main" className="editor-main">
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
            <input
              aria-label="本場"
              type="number"
              min={0}
              max={99}
              placeholder="—"
              value={context.honba ?? ''}
              onChange={(e) => {
                setContext({
                  ...context,
                  honba: e.target.value === '' ? null : Number(e.target.value),
                });
                mark();
              }}
            />
            <span className="ctx-mini__unit">本場</span>
          </label>
          <label className="ctx-mini">
            <input
              aria-label="供託"
              type="number"
              min={0}
              max={99}
              placeholder="—"
              value={context.riichiSticks ?? ''}
              onChange={(e) => {
                setContext({
                  ...context,
                  riichiSticks: e.target.value === '' ? null : Number(e.target.value),
                });
                mark();
              }}
            />
            <span className="ctx-mini__unit">供託</span>
          </label>
        </div>
        <div className={`ctx-scores${SCORE_FIELDS.some(([key]) => scoreInputs[key].mode === 'exact' || scoreInputs[key].draft.startsWith('-') || scoreInputs[key].error) ? ' ctx-scores--wide' : ''}`} aria-label="点数状況">
          <div className="ctx-scores__heading">
            <span className="ctx-scores__label">点数</span>

          </div>
          {SCORE_FIELDS.map(([key, label]) => (
            <label key={key} className="ctx-score">
              <span>{label}</span>
              <span className="score-number">
                <input ref={(node) => { scoreFields.current[key] = node; }} type="text" inputMode={scoreInputs[key].mode === 'hundreds' ? 'numeric' : 'text'} placeholder="—"
                  aria-label={scoreInputs[key].mode === 'hundreds' ? `${label}の点数（百点単位）` : `${label}の点数（そのまま）`}
                  aria-invalid={!!scoreInputs[key].error}
                  aria-describedby={scoreInputs[key].error ? `score-${key}-error` : undefined}
                  value={scoreInputs[key].draft} onChange={(event) => changeScore(key, event.target.value)} onBlur={() => normalizeScore(key)} />
                <span className="score-suffix" aria-hidden="true" data-empty={scoreInputs[key].draft === '' || undefined}>{scoreInputs[key].mode === 'hundreds' ? '00' : '点'}</span>
              </span>
            </label>
          ))}
        </div>
        {SCORE_FIELDS.map(([key, label]) => {
          const entry = scoreInputs[key];
          if (!entry.error) return null;
          const parsed = parseScoreInput(entry.draft, 'exact');
          const exactValue = parsed.ok ? parsed.value : null;
          return <div key={key} className="error score-input-error" id={`score-${key}-error`} role="alert">
            <p>{label}：{entry.error} 入力は未反映です。</p>
            <div className="score-error-actions">
              {entry.mode === 'hundreds' && exactValue !== null && <button type="button" className="btn" aria-label={`${label}の点数を${exactValue.toLocaleString()}点として反映`} onClick={() => adoptExactScore(key)}>{exactValue.toLocaleString()}点として反映</button>}
              <button type="button" className="btn" aria-label={`${label}の未反映入力を戻す`} onClick={() => resetScoreDraft(key)}>{context.scores[key] === null ? '未設定に戻す' : `${context.scores[key]!.toLocaleString()}点に戻す`}</button>
            </div>
          </div>;
        })}
      </section>

      <section className="panel tile-input">
        <div className="hand-stage" aria-label="牌姿プレビュー">
          <div className="hand-stage__top">
            <p className="hand-stage__meta">{contextSummary(context)}</p>
            <WanpaiDora doras={doraIndicators} onRemove={removeDoraAt} />
            {doraIndicators.length > LIMITS.doraMax && <div className="btn-row" role="alert">ドラ表示牌が5枚を超えています。余分な牌も保持しています：{doraIndicators.slice(LIMITS.doraMax).map((code, i) => <button key={i} type="button" className="btn" onClick={() => removeDoraAt(i + LIMITS.doraMax)}>表示牌{i + LIMITS.doraMax + 1}枚目（{code}）を削除</button>)}</div>}
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

        <div className="btn-row btn-row--compact tile-actions">
          <button type="button" className="btn" onClick={doSort}>
            理牌
          </button>
          <button type="button" className="btn" onClick={undo} disabled={!history.length}>
            戻す
          </button>
          <span className="tile-actions__remaining-group">
            <button type="button" className="btn btn-danger" onClick={clearAll}>全消去</button>
            <RemainingButton session={ukeire} />
          </span>
          <span className="count-inline">{countLabel}</span>
        </div>

        <RemainingSettings session={ukeire} />

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

        <p className="tile-input-tip">牌をタップして追加・削除</p>
        {supplyIssues.length > 0 && <div role="alert" className="error">入力済みの牌が上限を超えています。牌は自動で削除していません。手牌・鳴き・ドラ表示牌をタップして修正してください。{supplyIssues.map((issue) => <p key={issue}>{issue.replace('追加後', '現在')}</p>)}</div>}
        <div className="editor-palette">
          <TilePalette onPick={addTile} blockedReasons={blockedReasons} layout="all" />
          {isNew && <button type="button" className="btn btn-sm shot-button editor-shot-mobile" aria-label="スクショから" onClick={() => screenshotInput.current?.click()}><span className="editor-shot-mobile__label"><span>スクショ</span><wbr /><span>から</span></span></button>}
        </div>
        {error && target === 'meld' && <p className="error">{error}</p>}
      </section>

      </div>
  );
  const toolsPane = (
      <aside key="tools" className="editor-tools" aria-label="受入れと補足情報">
        <UkeireResults session={ukeire} />
      <details className="details panel editor-notes" open={notesOpen}>
        <summary onClick={(event) => { event.preventDefault(); setNotesOpen((open) => !open); }}>解説・メモなど</summary>


      <section className="panel">
        <label className="check">
          <input type="checkbox" checked={inTest} onChange={(event) => { setInTest(event.target.checked); mark(); }} />
          テストに出題する
        </label>
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
        {inTest && !answerEnabled && <p className="hint">正解を設定するとテストの対象になります。</p>}
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

      <details className="details panel" open={error?.includes("出典URL") || undefined}>
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
        <AttachmentEditor attachments={attachments} onChange={(next) => { setAttachments(next); mark(); }}
          onImage={onImage} imageMessage={imageMsg} sessionKey={existing?.id ?? 'new'} />
      </details>

      </details>
      </aside>
  );

  return (
    <div className="page page--editor">
      <header className="page-header page-header--compact">
        <h1>{isNew ? '問題を作成' : '問題を編集'}</h1>
      <label className="editor-title">
        <span className="sr-only">タイトル（任意）</span>
        <input
          ref={titleField}
          placeholder="タイトル（任意）"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            mark();
          }}
          maxLength={LIMITS.title}
        />
      </label>
        <div className="editor-header-actions">
        {isNew && (
          <>
            <button type="button" className="btn btn-sm shot-button editor-shot-desktop" onClick={() => screenshotInput.current?.click()}>スクショから</button>
            <input
              ref={screenshotInput}
              hidden
              aria-label="スクショを読み込む"
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
          </>
        )}
        <button type="button" className="btn btn-primary editor-save" onClick={save} disabled={imageBusy}>保存</button>
        </div>
      </header>
      {imported && (
        <p className="ok import-note">
          スクショから読み取りました。違うところがあれば直して保存してください。
          {imported.notes?.map((n) => <span key={n}> {n}</span>)}
        </p>
      )}

      {warns.map((w) => (
        <p key={w} className="warn">
          {w}
        </p>
      ))}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="editor-workspace">
        {[mainPane, toolsPane]}
      </div>
    </div>
  );
}
