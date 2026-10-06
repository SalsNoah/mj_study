import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/app/store';
import { HandBoard } from '@/components/HandBoard';
import { ViewTabs, viewPanelProps } from '@/components/ViewTabs';
import { UkeirePanel } from '@/components/UkeirePanel';
import { ExplanationAttachments, QuestionAttachments } from '@/components/ProblemAttachments';
import type { TileMark } from '@/components/HandView';
import { createId, nowIso } from '@/domain/ids';
import { attachmentsForRole } from '@/domain/attachments';
import {
  clampTestCount,
  computeSessionStats,
  filterTestCandidates,
  isInTest,
  judgeDiscard,
  selectTestProblems,
  TEST_RULES,
  type TestFilter,
} from '@/domain/quiz';
import type { Attempt, Problem, TileCode, Understanding } from '@/domain/types';
import { sessionRetestCandidates, snapshotSessionQuestions, type SessionQuestion, type SessionResults } from '@/domain/sessionRetest';
import { TestCountControl } from './TestCountControl';
import './testControls.css';

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

export function TestPage() {
  const { store, recordAttempt, updateUnderstanding, getTagName } = useApp();
  const [count, setCount] = useState(5);
  const [countInputValid, setCountInputValid] = useState(true);
  const [filters, setFilters] = useState<TestFilter[]>(['random']);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [answerView, setAnswerView] = useState<'notes' | 'ukeire'>('notes');
  const [phase, setPhase] = useState<Phase>('setup');
  const [queue, setQueue] = useState<SessionQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<TileCode | null>(null);
  const sessionId = useRef(createId('sess'));
  const [sessionResults, setSessionResults] = useState<SessionResults>({});
  const answeredLock = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const question = queue[index];
  const current = question?.problem;
  const results = Object.values(sessionResults);
  const currentResult = results.find(({ attempt }) => attempt.questionIndex === index);
  const understandingNow = currentResult?.understanding ?? 'unrated';
  const sessionAttempts = results.map(({ attempt }) => attempt);
  const retest = sessionRetestCandidates(sessionId.current, queue, sessionResults, store.problems, store.study);

  const candidates = useMemo(
    () => filterTestCandidates(store.problems, store.study, store.attempts, { filters, tagIds }),
    [store.problems, store.study, store.attempts, filters, tagIds],
  );
  const effectiveCount = clampTestCount(count, candidates.length);
  useEffect(() => {
    setCount((previous) => clampTestCount(previous, candidates.length));
    setCountInputValid(true);
  }, [candidates.length]);
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

  const beginSession = (picked: Problem[]) => {
    if (picked.length === 0) {
      setError('条件に合う問題がありません');
      return;
    }
    sessionId.current = createId('sess');
    setQueue(snapshotSessionQuestions(picked, store.study));
    setIndex(0);
    setPhase('question');
    setSelected(null);
    setSessionResults({});
    answeredLock.current = false;
    setError(null);
  };

  const start = () => {
    if (!countInputValid) return;
    beginSession(selectTestProblems(store.problems, store.study, store.attempts, {
      count: effectiveCount, filters, tagIds,
    }));
  };

  const startRetest = () => {
    // The original filters already qualified this cohort. Answers may change them.
    const eligible = sessionRetestCandidates(sessionId.current, queue, sessionResults, store.problems, store.study);
    beginSession(eligible.problems);
  };

  const submit = (tile: TileCode | null) => {
    if (!question || !current || answeredLock.current) return;
    if (!current.answerEnabled || !tile) return;
    answeredLock.current = true;
    const attempt: Attempt = {
      id: createId('attm'),
      problemId: current.id,
      contentRevision: question.contentRevision,
      sessionId: sessionId.current,
      questionIndex: index,
      at: nowIso(),
      selectedTile: tile,
      result: judgeDiscard(tile, current.acceptedDiscards),
    };
    const r = recordAttempt(attempt);
    if (!r.ok) {
      setError(r.reason);
      answeredLock.current = false;
      return;
    }
    setSessionResults((previous) => ({ ...previous, [attempt.id]: { attempt, understanding: 'unrated' } }));
    setError(null);
    setAnswerView('notes');
    setPhase('answered');
  };

  const rate = (u: Understanding) => {
    if (!current || !currentResult || phase !== 'answered') return;
    const latestStudy = store.study.find((s) => s.problemId === current.id);
    if (!store.problems.some((p) => p.id === current.id) || !latestStudy ||
      latestStudy.contentRevision !== currentResult.attempt.contentRevision) {
      setError('理解度を保存できませんでした。問題の内容・学習状態が変わったか、見つかりません。');
      return;
    }
    const saved = updateUnderstanding(current.id, u);
    if (!saved.ok) {
      setError(`理解度を保存できませんでした。${saved.reason}`);
      return;
    }
    setSessionResults((previous) => ({
      ...previous,
      [currentResult.attempt.id]: { ...currentResult, understanding: u },
    }));
    setError(null);
  };

  const next = () => {
    if (index + 1 >= queue.length) {
      setPhase('result');
      return;
    }
    setIndex(index + 1);
    setSelected(null);
    setError(null);
    setPhase('question');
    answeredLock.current = false;
  };

  const stats = computeSessionStats(sessionAttempts, results.map(({ understanding }) => understanding));

  if (phase === 'setup') {
    const tagOn = filters.includes('tags');
    return (
      <div className="page page--test">
        <header className="page-header page-header--compact">
          <h1>テスト</h1>
          <p className="count-pill">対象 {candidates.length} 問</p>
        </header>

        <section className="panel">
          <TestCountControl key={candidates.length} value={effectiveCount} max={candidates.length}
            onChange={setCount} onValidityChange={setCountInputValid} />
          <p className="hint test-eligibility-hint">正解があり、「テストに出題する」がオンの問題から出題します。</p>
        </section>

        <details className="details panel">
          <summary>出題条件：{filters.map(id => FILTERS.find(f => f.id === id)!.label).join('・')}</summary>
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
        </details>

        {candidates.length === 0 && (
          <p className="hint" role="status">条件に合う正解ありの問題がありません。</p>
        )}
        {error && <p className="error">{error}</p>}
        <div className="sticky-actions test-start-actions">
          <button
            type="button"
            className="btn btn-primary btn-save"
            onClick={start}
            disabled={candidates.length === 0 || !countInputValid}
          >
            {candidates.length === 0 ? '条件に合う問題がありません'
              : !countInputValid ? '問題数を確認してください' : `${effectiveCount} 問でテスト開始`}
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
              const p = queue.find((q) => q.problem.id === a.problemId)?.problem;
              return (
                <li key={a.id}>
                  <span className={`result-mark result-mark--${a.result}`}>
                    {a.result === 'correct' ? '○' : a.result === 'incorrect' ? '×' : '—'}
                  </span>
                  <Link to={`/problems/${a.problemId}`}>{p?.title.trim() || '無題の問題'}</Link>
                  {sessionResults[a.id]?.understanding === 'uncertain' && <span className="hint">まだ不安</span>}
                </li>
              );
            })}
          </ol>
        </section>
        <section className="panel">
          <button type="button" className="btn btn-primary" onClick={startRetest} disabled={retest.problems.length === 0}>
            今回の誤答・不安 {retest.problems.length}問を再テスト
          </button>
          {retest.excludedCount > 0 && <p className="hint" role="status">
            削除・内容や出題設定の変更で {retest.excludedCount}問を除外しました。
          </p>}
          {retest.problems.length === 0 && <p className="hint">今回の回答に再テストできる問題はありません。</p>}
          {error && <p className="error" role="alert">{error}</p>}
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

  const answerMarks =
    phase === 'answered' && current.answerEnabled
      ? new Map<TileCode, TileMark>([
          ...(verdict === 'incorrect' && selected ? [[selected, 'wrong'] as const] : []),
          ...current.acceptedDiscards.map((c) => [c, 'correct'] as const),
        ])
      : undefined;

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
          selectedCodes={phase === 'question' && selected ? new Set([selected]) : undefined}
          marks={answerMarks}
          onSelectCode={(code) => setSelected(code)}
        />
        <QuestionAttachments attachments={current.attachments} sessionKey={`${sessionId.current}:${index}:${current.id}`} />
        {answerMarks && (
          <p className="mark-legend">
            <i className="mark-legend__correct" />正解
            {verdict === 'incorrect' && (
              <>
                <i className="mark-legend__wrong" />あなたの選択
              </>
            )}
          </p>
        )}
        {phase === 'question' && (
          <>
            <p className="hint test-hint">
              {selected ? '選んだ牌でよければ「回答する」' : '切る牌をタップしてください'}
            </p>
            <div className="sticky-actions">
              <button
                type="button"
                className="btn btn-primary btn-save"
                disabled={!selected}
                onClick={() => submit(selected)}
              >
                回答する
              </button>
            </div>
          </>
        )}
      </section>

      {phase === 'answered' && (
        <section className="panel answer-panel">
          {verdict && (
            <p className={`verdict verdict--${verdict}`}>{verdict === 'correct' ? '正解' : '不正解'}</p>
          )}
          <div className="seg seg--wide" role="group" aria-label="理解度">
            <button
              type="button"
              className={understandingNow === 'understood' ? 'is-on' : ''}
              aria-pressed={understandingNow === 'understood'}
              onClick={() => rate('understood')}
            >
              理解できた
            </button>
            <button
              type="button"
              className={understandingNow === 'uncertain' ? 'is-on' : ''}
              aria-pressed={understandingNow === 'uncertain'}
              onClick={() => rate('uncertain')}
            >
              まだ不安
            </button>
          </div>

        </section>
      )}
      {phase === 'answered' && <>
        <ViewTabs id="answer-view" label="回答後の表示" value={answerView} onChange={setAnswerView}
          tabs={[{ value: 'notes', label: '解説' }, { value: 'ukeire', label: '受入れ' }]} />
        <div {...viewPanelProps('answer-view', 'notes', answerView)} className="panel">
          {current.explanation && <p className="prewrap">{current.explanation}</p>}
          <ExplanationAttachments attachments={current.attachments}
            sessionKey={`${sessionId.current}:${index}:${current.id}`} visible={answerView === 'notes'} />
          {current.tagIds.length > 0 && (
            <div className="tag-cloud">
              {current.tagIds.map((id) => (
                <span key={id} className="tag-chip">
                  {getTagName(id)}
                </span>
              ))}
            </div>
          )}
          {!current.explanation && attachmentsForRole(current.attachments, 'explanation').length === 0 && (
            <p className="hint">解説はまだありません。</p>
          )}
        </div>
        <div {...viewPanelProps('answer-view', 'ukeire', answerView)}>
          <UkeirePanel {...current} sessionKey={current.id} />
        </div>
      </>}

      {phase === 'answered' && (          <div className="sticky-actions">
            <button type="button" className="btn btn-primary btn-save" onClick={next}>
              {index + 1 >= queue.length ? '結果を見る' : '次の問題へ'}
            </button>
          </div>)}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
