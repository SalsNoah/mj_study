import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/app/store';
import { HandBoard } from '@/components/HandBoard';
import { TileFace } from '@/components/TileFace';
import { createId, nowIso } from '@/domain/ids';
import {
  computeSessionStats,
  filterTestCandidates,
  isInTest,
  judgeDiscard,
  selectTestProblems,
  TEST_RULES,
  type TestFilter,
} from '@/domain/quiz';
import type { Attempt, Problem, TileCode, Understanding } from '@/domain/types';

type Phase = 'setup' | 'question' | 'answered' | 'result';

const FILTERS: Array<{ id: TestFilter; label: string; hint: string }> = [
  { id: 'random', label: '完全ランダム', hint: '対象の問題からランダムに出題' },
  {
    id: 'lowAccuracy',
    label: '正答率が低い',
    hint: `直近${TEST_RULES.recentWindow}回の正答率が${TEST_RULES.lowAccuracyMax * 100}%以下`,
  },
  { id: 'fewAnswers', label: '回答数が少ない', hint: `回答が${TEST_RULES.fewAnswersBelow}回未満` },
  { id: 'stale', label: '最近答えていない', hint: `最後の回答が${TEST_RULES.staleDays}日以上前（未回答含む）` },
  { id: 'tags', label: 'タグ', hint: '選んだタグのいずれかを持つ問題' },
];

const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function TestPage() {
  const { store, recordAttempt, updateUnderstanding, getTagName } = useApp();
  const [count, setCount] = useState(5);
  const [filters, setFilters] = useState<TestFilter[]>(['random']);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('setup');
  const [queue, setQueue] = useState<Problem[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<TileCode | null>(null);
  const sessionId = useRef(createId('sess'));
  const [sessionAttempts, setSessionAttempts] = useState<Attempt[]>([]);
  const [sessionUnderstandings, setSessionUnderstandings] = useState<Understanding[]>([]);
  const [understandingNow, setUnderstandingNow] = useState<Understanding | null>(null);
  const answeredLock = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const current = queue[index];
  const study = current ? store.study.find((s) => s.problemId === current.id) : undefined;

  const candidates = useMemo(
    () => filterTestCandidates(store.problems, store.study, store.attempts, { filters, tagIds }),
    [store.problems, store.study, store.attempts, filters, tagIds],
  );
  const excludedCount = useMemo(() => {
    const studyMap = new Map(store.study.map((s) => [s.problemId, s]));
    return store.problems.filter((p) => !isInTest(studyMap.get(p.id))).length;
  }, [store.problems, store.study]);

  const toggleFilter = (id: TestFilter) => {
    setFilters((prev) => {
      if (id === 'random') return ['random'];
      const rest = prev.filter((f) => f !== 'random');
      const next = rest.includes(id) ? rest.filter((f) => f !== id) : [...rest, id];
      return next.length ? next : ['random'];
    });
  };

  const start = () => {
    const picked = selectTestProblems(store.problems, store.study, store.attempts, {
      count,
      filters,
      tagIds,
    });
    if (picked.length === 0) {
      setError('条件に合う問題がありません');
      return;
    }
    sessionId.current = createId('sess');
    setQueue(picked);
    setIndex(0);
    setPhase('question');
    setSelected(null);
    setSessionAttempts([]);
    setSessionUnderstandings([]);
    setUnderstandingNow(null);
    answeredLock.current = false;
    setError(null);
  };

  const submit = (tile: TileCode | null) => {
    if (!current || answeredLock.current) return;
    if (current.answerEnabled && !tile) return;
    answeredLock.current = true;
    const attempt: Attempt = {
      id: createId('attm'),
      problemId: current.id,
      contentRevision: study?.contentRevision ?? 0,
      sessionId: sessionId.current,
      questionIndex: index,
      at: nowIso(),
      selectedTile: tile,
      result: current.answerEnabled ? judgeDiscard(tile!, current.acceptedDiscards) : 'selfReview',
    };
    const r = recordAttempt(attempt);
    if (!r.ok) {
      setError(r.reason);
      answeredLock.current = false;
      return;
    }
    setSessionAttempts((a) => [...a, attempt]);
    setPhase('answered');
  };

  const rate = (u: Understanding) => {
    if (!current) return;
    updateUnderstanding(current.id, u);
    setUnderstandingNow(u);
    setSessionUnderstandings((list) => [...list, u]);
  };

  const next = () => {
    if (index + 1 >= queue.length) {
      setPhase('result');
      return;
    }
    setIndex(index + 1);
    setSelected(null);
    setUnderstandingNow(null);
    setPhase('question');
    answeredLock.current = false;
  };

  const stats = useMemo(
    () => computeSessionStats(sessionAttempts, sessionUnderstandings),
    [sessionAttempts, sessionUnderstandings],
  );

  if (phase === 'setup') {
    const tagOn = filters.includes('tags');
    return (
      <div className="page page--test">
        <header className="page-header page-header--compact">
          <h1>テスト</h1>
          <p className="count-pill">対象 {candidates.length} 問</p>
        </header>

        <section className="panel">
          <h2 className="mini-title">問題数</h2>
          <div className="count-grid" role="group" aria-label="問題数">
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                className={count === n ? 'is-on' : ''}
                aria-pressed={count === n}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2 className="mini-title">出題条件</h2>
          <p className="hint">「完全ランダム」以外は組み合わせできます（すべて満たす問題から出題）。</p>
          <div className="filter-list">
            {FILTERS.map((f) => {
              const on = filters.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`filter-chip${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggleFilter(f.id)}
                >
                  <strong>{f.label}</strong>
                  <span>{f.hint}</span>
                </button>
              );
            })}
          </div>
          {tagOn && (
            <div className="tag-cloud">
              {store.tags.length === 0 && <p className="hint">タグがまだありません</p>}
              {store.tags.map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`tag-chip${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() =>
                      setTagIds((ids) => (on ? ids.filter((x) => x !== t.id) : [...ids, t.id]))
                    }
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          )}
          {excludedCount > 0 && (
            <p className="hint">テスト対象外にした {excludedCount} 問は出題しません。</p>
          )}
          {candidates.length > 0 && candidates.length < count && (
            <p className="warn">条件に合う問題が {candidates.length} 問なので、{candidates.length} 問で出題します。</p>
          )}
        </section>

        {error && <p className="error">{error}</p>}
        <div className="sticky-actions">
          <button
            type="button"
            className="btn btn-primary btn-save"
            onClick={start}
            disabled={candidates.length === 0}
          >
            {candidates.length === 0 ? '条件に合う問題がありません' : `${Math.min(count, candidates.length)} 問でテスト開始`}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'result') {
    return (
      <div className="page page--test">
        <header className="page-header page-header--compact">
          <h1>テスト結果</h1>
        </header>
        <section className="panel result-card">
          <p className="result-score">
            {stats.autoAnswered > 0 ? (
              <>
                <strong>{stats.autoCorrect}</strong> / {stats.autoAnswered} 問正解
              </>
            ) : (
              <>
                <strong>{sessionAttempts.length}</strong> 問解きました
              </>
            )}
          </p>
          {stats.accuracy != null && (
            <p className="hint">正答率 {Math.round(stats.accuracy * 100)}%</p>
          )}
          <ol className="result-list">
            {sessionAttempts.map((a) => {
              const p = queue.find((q) => q.id === a.problemId);
              return (
                <li key={a.id}>
                  <span className={`result-mark result-mark--${a.result}`}>
                    {a.result === 'correct' ? '○' : a.result === 'incorrect' ? '×' : '—'}
                  </span>
                  <Link to={`/problems/${a.problemId}`}>{p?.title.trim() || '無題の問題'}</Link>
                </li>
              );
            })}
          </ol>
        </section>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => setPhase('setup')}>
            もう一度
          </button>
          <Link className="btn" to="/records">
            記録帳を見る
          </Link>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const verdict =
    phase === 'answered' && current.answerEnabled && selected
      ? judgeDiscard(selected, current.acceptedDiscards)
      : null;

  return (
    <div className="page page--test">
      <header className="page-header page-header--compact">
        <h1>
          テスト {index + 1} / {queue.length}
        </h1>
        <button type="button" className="btn btn-sm" onClick={() => setPhase('result')}>
          終了
        </button>
      </header>
      <div className="progress" aria-hidden>
        <span style={{ width: `${((index + (phase === 'answered' ? 1 : 0)) / queue.length) * 100}%` }} />
      </div>

      {current.title.trim() && <p className="test-title">{current.title}</p>}

      <section className="panel">
        <HandBoard
          concealed={current.concealed}
          drawn={current.drawn}
          melds={current.melds}
          doraIndicators={current.doraIndicators}
          context={current.context}
          selectable={phase === 'question' && current.answerEnabled}
          selectedCodes={selected ? new Set([selected]) : undefined}
          onSelectCode={(code) => setSelected(code)}
        />
        {phase === 'question' && (
          <>
            <p className="hint test-hint">
              {current.answerEnabled
                ? selected
                  ? '選んだ牌でよければ「回答する」'
                  : '切る牌をタップしてください'
                : 'この問題は正解なし。考えたら解説を見てください'}
            </p>
            <div className="sticky-actions">
              {current.answerEnabled ? (
                <button
                  type="button"
                  className="btn btn-primary btn-save"
                  disabled={!selected}
                  onClick={() => submit(selected)}
                >
                  回答する
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-save" onClick={() => submit(null)}>
                  解説を見る
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {phase === 'answered' && (
        <section className="panel answer-panel">
          {verdict && (
            <p className={`verdict verdict--${verdict}`}>{verdict === 'correct' ? '正解' : '不正解'}</p>
          )}
          {current.answerEnabled && (
            <div className="answer-tiles">
              <span>正解</span>
              <div className="tile-row">
                {current.acceptedDiscards.map((c, i) => (
                  <TileFace key={i} code={c} size={30} />
                ))}
              </div>
              {selected && (
                <>
                  <span>あなた</span>
                  <TileFace code={selected} size={30} />
                </>
              )}
            </div>
          )}
          {current.explanation && <p className="prewrap">{current.explanation}</p>}
          {current.tagIds.length > 0 && (
            <div className="tag-cloud">
              {current.tagIds.map((id) => (
                <span key={id} className="tag-chip">
                  {getTagName(id)}
                </span>
              ))}
            </div>
          )}
          <div className="seg seg--wide" role="group" aria-label="理解度">
            <button
              type="button"
              className={understandingNow === 'understood' ? 'is-on' : ''}
              onClick={() => rate('understood')}
            >
              理解できた
            </button>
            <button
              type="button"
              className={understandingNow === 'uncertain' ? 'is-on' : ''}
              onClick={() => rate('uncertain')}
            >
              まだ不安
            </button>
          </div>
          <div className="sticky-actions">
            <button type="button" className="btn btn-primary btn-save" onClick={next}>
              {index + 1 >= queue.length ? '結果を見る' : '次の問題へ'}
            </button>
          </div>
        </section>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
