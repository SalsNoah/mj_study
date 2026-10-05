import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '@/app/store';
import { HandBoard } from '@/components/HandBoard';
import { ViewTabs, viewPanelProps } from '@/components/ViewTabs';
import { UkeirePanel } from '@/components/UkeirePanel';
import { ExplanationAttachments, QuestionAttachments } from '@/components/ProblemAttachments';
import { accuracyForProblem, isInTest } from '@/domain/quiz';
import { attachmentsForRole } from '@/domain/attachments';
import { formatShortDate } from '@/domain/records';
import {
  DEFAULT_SHARE_OPTIONS,
  buildShareUrl,
  encodeSharePayload,
  extractSharePayload,
  isLocalHost,
  shareUrlTooLong,
  type ShareOptions,
} from '@/domain/share';
import type { StudyState } from '@/domain/types';
import { DuplicateProblemButton } from './DuplicateProblemButton';

export function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    store,
    getTagName,
    confirmProblem,
    undoConfirm,
    deleteProblem,
    duplicateProblem,
    setInTest,
  } = useApp();
  const problem = store.problems.find((p) => p.id === id);
  const study = store.study.find((s) => s.problemId === id);
  const [view, setView] = useState<'notes' | 'ukeire' | 'record'>('notes');
  const answerKey = `${problem?.id ?? ''}:${problem?.updatedAt ?? ''}`;
  const [answerState, setAnswerState] = useState({ key: answerKey, visible: false });
  const answerVisible = answerState.key === answerKey && answerState.visible;
  if (answerState.key !== answerKey) setAnswerState({ key: answerKey, visible: false });
  const [undoState, setUndoState] = useState<StudyState | null>(null);
  const confirmLock = useRef(false);
  const [shareOpts, setShareOpts] = useState<ShareOptions>(DEFAULT_SHARE_OPTIONS);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!problem) {
    return (
      <div className="page">
        <p>問題が見つかりません。</p>
        <Link to="/library">一覧へ</Link>
      </div>
    );
  }

  const acc = accuracyForProblem(
    store.attempts,
    problem.id,
    study?.contentRevision ?? 0,
  );

  const onConfirm = () => {
    if (confirmLock.current || !study) return;
    confirmLock.current = true;
    setUndoState({ ...study });
    const r = confirmProblem(problem.id);
    if (!r.ok) {
      setMsg(r.reason);
      confirmLock.current = false;
      setUndoState(null);
      return;
    }
    window.setTimeout(() => {
      setUndoState(null);
      confirmLock.current = false;
    }, 5000);
  };

  const onUndo = () => {
    if (!undoState) return;
    undoConfirm(problem.id, undoState);
    setUndoState(null);
    confirmLock.current = false;
  };

  const onShare = () => {
    const tags = problem.tagIds.map(getTagName);
    const payload = extractSharePayload(problem, tags, shareOpts);
    const encoded = encodeSharePayload(payload);
    const origin = window.location.origin;
    const basePath = import.meta.env.BASE_URL || '/';
    const url = buildShareUrl(origin, basePath, encoded);
    if (shareUrlTooLong(url)) {
      setShareMsg('共有URLが8000文字を超えました。解説を外すか短くしてください。');
      setShareUrl(null);
      return;
    }
    setShareUrl(url);
    setShareMsg(isLocalHost(window.location.hostname)
      ? 'localhost のURLは他者向け共有に使えません。静的ホストへデプロイしたURLを使ってください。'
      : null);
  };

  return (
    <div className="page">
      <header className="page-header page-header--problem">
        <h1>{problem.title.trim() || '無題の問題'}</h1>
        <span className={`badge ${problem.answerEnabled ? 'badge-answer' : 'badge-memo'}`}>
          {problem.answerEnabled ? '正解あり' : '正解なし'}
        </span>
      </header>

      <section className="panel">
        <HandBoard
          concealed={problem.concealed}
          drawn={problem.drawn}
          melds={problem.melds}
          doraIndicators={problem.doraIndicators}
          context={problem.context}
          marks={
            problem.answerEnabled && answerVisible
              ? new Map(problem.acceptedDiscards.map((c) => [c, 'correct' as const]))
              : undefined
          }
        />
        <QuestionAttachments attachments={problem.attachments} sessionKey={answerKey} />
        {problem.answerEnabled && (
          <button
            type="button"
            className="btn detail-answer-toggle"
            aria-pressed={answerVisible}
            onClick={() => setAnswerState({ key: answerKey, visible: !answerVisible })}
          >
            {answerVisible ? '正解・解説を隠す' : '正解・解説を表示'}
          </button>
        )}
        {problem.answerEnabled && answerVisible && (
          <p className="mark-legend">
            <i className="mark-legend__correct" />正解（切る牌）
          </p>
        )}
      </section>

        <div className="detail-primary-actions">
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={!!undoState}>
            確認した
          </button>
          {undoState && (
            <button type="button" className="btn" onClick={onUndo}>
              取り消す
            </button>
          )}
          <Link className="btn" to={`/edit/${problem.id}`}>編集</Link>
        </div>
      <ViewTabs id="detail-view" label="問題の表示" value={view} onChange={setView}
        tabs={[{ value: 'notes', label: '解説・メモ' }, { value: 'ukeire', label: '受入れ' }, { value: 'record', label: '記録' }]} />
      <div {...viewPanelProps('detail-view', 'notes', view)}>
      {problem.tagIds.length > 0 && (
        <div className="tag-cloud">
          {problem.tagIds.map((tid) => (
            <span key={tid} className="tag-chip">{getTagName(tid)}</span>
          ))}
        </div>
      )}

      {(!problem.answerEnabled || answerVisible) ? <>
      {problem.explanation && (
        <section className="panel">
          <h2 className="section-title">解説</h2>
          <p className="prewrap">{problem.explanation}</p>
        </section>
      )}
      {problem.privateMemo && (
        <section className="panel">
          <h2 className="section-title">自分のメモ</h2>
          <p className="prewrap">{problem.privateMemo}</p>
        </section>
      )}
      {problem.sourceUrl && (
        <p>
          出典:{' '}
          <a href={problem.sourceUrl} target="_blank" rel="noopener noreferrer">
            {problem.sourceUrl}
          </a>
        </p>
      )}
      <ExplanationAttachments attachments={problem.attachments} sessionKey={answerKey} visible={!problem.answerEnabled || answerVisible} />

      {!problem.explanation && !problem.privateMemo && attachmentsForRole(problem.attachments, 'explanation').length === 0 && <p className="hint">解説・メモはまだありません。</p>}
      </> : <p className="hint">正解・解説は非表示です。</p>}
      </div>
      <div {...viewPanelProps('detail-view', 'ukeire', view)}>
        <UkeirePanel {...problem} sessionKey={problem.id} />
      </div>
      <div {...viewPanelProps('detail-view', 'record', view)}>
      <section className="panel">
        <dl className="stat-list">
          <div>
            <dt>最後に解いた日</dt>
            <dd>{formatShortDate(study?.lastSolvedAt)}</dd>
          </div>
          <div>
            <dt>最後に正解した日</dt>
            <dd>{problem.answerEnabled ? formatShortDate(study?.lastCorrectAt) : '正解なし'}</dd>
          </div>
          <div>
            <dt>正答率</dt>
            <dd>{acc.rate == null ? '—' : `${Math.round(acc.rate * 100)}%（${acc.correct}/${acc.total}）`}</dd>
          </div>
          <div>
            <dt>確認回数</dt>
            <dd>
              {study?.confirmationCount ?? 0}回（最終 {formatShortDate(study?.lastConfirmedAt)}）
            </dd>
          </div>
          <div>
            <dt>理解</dt>
            <dd>
              {study?.understanding === 'understood'
                ? '理解できた'
                : study?.understanding === 'uncertain'
                  ? 'まだ不安'
                  : '未評価'}
            </dd>
          </div>
        </dl>
        <label className="switch-row">
          <span>
            <strong>テストに出題する</strong>
            <small>オフにするとテストの候補から外れます</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={isInTest(study)}
            onChange={(e) => {
              const r = setInTest(problem.id, e.target.checked);
              if (!r.ok) setMsg(r.reason);
            }}
          />
        </label>

      </section>

      </div>
      <details className="details panel detail-tools">
        <summary>共有・その他</summary>
      <div className="btn-row wrap">
        <DuplicateProblemButton
          key={problem.id}
          title={problem.title}
          onDuplicate={() => {
            setMsg(null);
            const r = duplicateProblem(problem.id);
            if (r.ok) {
              const newest = r.store.problems[r.store.problems.length - 1];
              if (newest) navigate(`/problems/${newest.id}`);
            } else setMsg(r.reason);
          }}
        />
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (!window.confirm('この問題を削除しますか？')) return;
            const r = deleteProblem(problem.id);
            if (r.ok) navigate('/library');
            else setMsg(r.reason);
          }}
        >
          削除
        </button>
      </div>

      <section className="panel">
        <h2 className="section-title">URL共有</h2>
        <div className="check-grid">
          <label className="check">
            <input
              type="checkbox"
              checked={shareOpts.includeAnswerAndExplanation}
              onChange={(e) =>
                setShareOpts({ ...shareOpts, includeAnswerAndExplanation: e.target.checked })
              }
            />
            正解・解説を含める
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={shareOpts.includeTags}
              onChange={(e) => setShareOpts({ ...shareOpts, includeTags: e.target.checked })}
            />
            タグを含める
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={shareOpts.includeSourceUrl}
              onChange={(e) => setShareOpts({ ...shareOpts, includeSourceUrl: e.target.checked })}
            />
            出典URLを含める
          </label>
        </div>
        <button type="button" className="btn btn-primary" onClick={onShare}>
          共有URLを生成
        </button>
        {shareMsg && <p className="warn">{shareMsg}</p>}
        {shareUrl && (
          <div className="share-box">
            <p className="hint">プレビュー（画像・メモ・履歴は含まれません）</p>
            <textarea readOnly value={shareUrl} rows={4} />
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
                setMsg('コピーしました');
              }}
            >
              コピー
            </button>
          </div>
        )}
      </section>

      </details>

      {msg && <p className="ok">{msg}</p>}
    </div>
  );
}
