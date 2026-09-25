import { useMemo, useRef, useState } from 'react';
import { useApp } from '@/app/store';
import { HandView } from '@/components/HandView';
import { createId, nowIso } from '@/domain/ids';
import {
  computeSessionStats,
  judgeDiscard,
  orderReviewCandidates,
  type ReviewOrder,
} from '@/domain/quiz';
import type { Attempt, Problem, TileCode, Understanding } from '@/domain/types';

type Phase = 'setup' | 'question' | 'answered' | 'result';

export function ReviewPage() {
  const { store, recordAttempt, updateUnderstanding, confirmProblem, getTagName } = useApp();
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [order, setOrder] = useState<ReviewOrder>('random');
  const [count, setCount] = useState<10 | 20 | 'all'>(10);
  const [phase, setPhase] = useState<Phase>('setup');
  const [queue, setQueue] = useState<Problem[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<TileCode | null>(null);
  const [sessionId] = useState(() => createId('sess'));
  const [sessionAttempts, setSessionAttempts] = useState<Attempt[]>([]);
  const [sessionUnderstandings, setSessionUnderstandings] = useState<Understanding[]>([]);
  const answeredLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  const current = queue[index];

  const start = () => {
    const candidates = orderReviewCandidates(
      store.problems,
      store.study,
      store.attempts,
      { tagIds, order, count },
    );
    if (candidates.length === 0) {
      setError(
        tagIds.length
          ? '選択したタグに該当する問題がありません'
          : '復習できる問題がありません',
      );
      return;
    }
    setQueue(candidates);
    setIndex(0);
    setPhase('question');
    setSelected(null);
    setShowAnswer(false);
    setSessionAttempts([]);
    setSessionUnderstandings([]);
    answeredLock.current = false;
    setError(null);
  };

  const study = current
    ? store.study.find((s) => s.problemId === current.id)
    : undefined;

  const submitAnswer = () => {
    if (!current || answeredLock.current) return;
    if (current.answerEnabled && !selected) return;
    answeredLock.current = true;
    const result = current.answerEnabled
      ? judgeDiscard(selected!, current.acceptedDiscards)
      : 'selfReview';
    const attempt: Attempt = {
      id: createId('attm'),
      problemId: current.id,
      contentRevision: study?.contentRevision ?? 0,
      sessionId,
      questionIndex: index,
      at: nowIso(),
      selectedTile: selected,
      result,
    };
    const r = recordAttempt(attempt);
    if (!r.ok) {
      setError(r.reason);
      answeredLock.current = false;
      return;
    }
    setSessionAttempts((a) => [...a, attempt]);
    setShowAnswer(true);
    setPhase('answered');
  };

  const showExplanationOnly = () => {
    if (!current || current.answerEnabled || answeredLock.current) return;
    answeredLock.current = true;
    const attempt: Attempt = {
      id: createId('attm'),
      problemId: current.id,
      contentRevision: study?.contentRevision ?? 0,
      sessionId,
      questionIndex: index,
      at: nowIso(),
      selectedTile: null,
      result: 'selfReview',
    };
    const r = recordAttempt(attempt);
    if (!r.ok) {
      setError(r.reason);
      answeredLock.current = false;
      return;
    }
    setSessionAttempts((a) => [...a, attempt]);
    setShowAnswer(true);
    setPhase('answered');
  };

  const setUnderstanding = (u: Understanding) => {
    if (!current) return;
    updateUnderstanding(current.id, u);
    setSessionUnderstandings((list) => [...list, u]);
  };

  const next = () => {
    if (index + 1 >= queue.length) {
      setPhase('result');
      return;
    }
    setIndex(index + 1);
    setSelected(null);
    setShowAnswer(false);
    setPhase('question');
    answeredLock.current = false;
  };

  const stats = useMemo(
    () => computeSessionStats(sessionAttempts, sessionUnderstandings),
    [sessionAttempts, sessionUnderstandings],
  );

  if (phase === 'setup') {
    return (
      <div className="page">
        <header className="page-header">
          <h1>復習</h1>
        </header>
        <section className="panel">
          <fieldset>
            <legend>タグ絞り込み（任意）</legend>
            <div className="tag-cloud">
              {store.tags.map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`tag-chip${on ? ' is-on' : ''}`}
                    onClick={() =>
                      setTagIds((ids) =>
                        on ? ids.filter((x) => x !== t.id) : [...ids, t.id],
                      )
                    }
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="field">
            <span>出題順</span>
            <select value={order} onChange={(e) => setOrder(e.target.value as ReviewOrder)}>
              <option value="random">ランダム</option>
              <option value="weakFirst">苦手優先</option>
            </select>
          </label>
          <label className="field">
            <span>問題数</span>
            <select
              value={String(count)}
              onChange={(e) => {
                const v = e.target.value;
                setCount(v === 'all' ? 'all' : (Number(v) as 10 | 20));
              }}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="all">全件</option>
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <button type="button" className="btn btn-primary" onClick={start}>
            開始
          </button>
        </section>
      </div>
    );
  }

  if (phase === 'result') {
    return (
      <div className="page">
        <header className="page-header">
          <h1>結果</h1>
        </header>
        <section className="panel">
          <p>出題数: {queue.length}</p>
          <p>
            自動判定: {stats.autoCorrect} / {stats.autoAnswered}
            （正答率:{' '}
            {stats.accuracy == null ? '—' : `${Math.round(stats.accuracy * 100)}%`}）
          </p>
          <p>理解できた: {stats.understood} / まだ不安: {stats.uncertain}</p>
          <button type="button" className="btn btn-primary" onClick={() => setPhase('setup')}>
            もう一度設定へ
          </button>
        </section>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="page">
      <header className="page-header">
        <h1>
          復習 {index + 1} / {queue.length}
        </h1>
        <button type="button" className="btn" onClick={() => setPhase('result')}>
          途中終了
        </button>
      </header>

      <section className="panel">
        <HandView
          concealed={current.concealed}
          drawn={current.drawn}
          melds={current.melds}
          size={42}
          selectablePool={
            current.answerEnabled && phase === 'question' ? 'concealedDrawn' : 'none'
          }
          selectedCodes={selected ? new Set([selected]) : undefined}
          onSelectCode={(code) => {
            if (phase !== 'question' || !current.answerEnabled) return;
            setSelected(code);
          }}
        />
        {current.doraIndicators.length > 0 && phase !== 'question' && (
          <p className="hint">ドラ表示牌は解答後に詳細で確認できます</p>
        )}
        {/* ネタバレ防止: 問題フェーズでは解説・正解・メモ・タグ・出典・参考画像を出さない */}
        {phase === 'question' && (
          <div className="btn-row">
            {current.answerEnabled ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!selected}
                onClick={submitAnswer}
              >
                回答する
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={showExplanationOnly}>
                解説を見る
              </button>
            )}
          </div>
        )}
      </section>

      {phase === 'answered' && showAnswer && (
        <section className="panel">
          {current.answerEnabled && (
            <p className={selected && judgeDiscard(selected, current.acceptedDiscards) === 'correct' ? 'ok' : 'error'}>
              {selected && judgeDiscard(selected, current.acceptedDiscards) === 'correct'
                ? '正解'
                : '不正解'}
            </p>
          )}
          {current.explanation && (
            <>
              <h2 className="section-title">解説</h2>
              <p className="prewrap">{current.explanation}</p>
            </>
          )}
          {current.answerEnabled && (
            <p>正解牌: {current.acceptedDiscards.join(', ')}</p>
          )}
          {current.tagIds.length > 0 && (
            <div className="tag-cloud">
              {current.tagIds.map((id) => (
                <span key={id} className="tag-chip">{getTagName(id)}</span>
              ))}
            </div>
          )}
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setUnderstanding('understood')}>
              理解できた
            </button>
            <button type="button" className="btn" onClick={() => setUnderstanding('uncertain')}>
              まだ不安
            </button>
            <button type="button" className="btn" onClick={() => confirmProblem(current.id)}>
              確認した
            </button>
            <button type="button" className="btn btn-primary" onClick={next}>
              次へ
            </button>
          </div>
        </section>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
