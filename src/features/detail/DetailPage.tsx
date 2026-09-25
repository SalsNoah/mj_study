import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '@/app/store';
import { HandView } from '@/components/HandView';
import { TileFace } from '@/components/TileFace';
import { accuracyForProblem } from '@/domain/quiz';
import {
  DEFAULT_SHARE_OPTIONS,
  buildShareUrl,
  encodeSharePayload,
  extractSharePayload,
  isLocalHost,
  shareUrlTooLong,
  type ShareOptions,
} from '@/domain/share';
import { renderHandPng } from '@/export/renderTiles';
import type { StudyState } from '@/domain/types';

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
  } = useApp();
  const problem = store.problems.find((p) => p.id === id);
  const study = store.study.find((s) => s.problemId === id);
  const [undoState, setUndoState] = useState<StudyState | null>(null);
  const confirmLock = useRef(false);
  const [shareOpts, setShareOpts] = useState<ShareOptions>(DEFAULT_SHARE_OPTIONS);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [pngPreview, setPngPreview] = useState<string | null>(null);
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

  const onPng = async () => {
    const { dataUrl, blob, filename } = await renderHandPng(problem);
    setPngPreview(dataUrl);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>{problem.title.trim() || '無題の問題'}</h1>
        <span className={`badge ${problem.answerEnabled ? 'badge-answer' : 'badge-memo'}`}>
          {problem.answerEnabled ? '正解あり' : '正解なし'}
        </span>
      </header>

      <section className="panel">
        <HandView concealed={problem.concealed} drawn={problem.drawn} melds={problem.melds} size={42} />
        {problem.doraIndicators.length > 0 && (
          <div className="dora-row">
            <span>ドラ表示牌</span>
            <div className="tile-row">
              {problem.doraIndicators.map((c, i) => (
                <TileFace key={i} code={c} size={32} />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="meta-grid">
          <div>確認回数: {study?.confirmationCount ?? 0}</div>
          <div>
            理解:{' '}
            {study?.understanding === 'understood'
              ? '理解できた'
              : study?.understanding === 'uncertain'
                ? 'まだ不安'
                : '未評価'}
          </div>
          <div>
            正答率:{' '}
            {acc.rate == null ? '—' : `${Math.round(acc.rate * 100)}% (${acc.correct}/${acc.total})`}
          </div>
          <div>
            最終確認:{' '}
            {study?.lastConfirmedAt
              ? new Date(study.lastConfirmedAt).toLocaleString()
              : '—'}
          </div>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={!!undoState}>
            確認した
          </button>
          {undoState && (
            <button type="button" className="btn" onClick={onUndo}>
              取り消す
            </button>
          )}
        </div>
      </section>

      {problem.tagIds.length > 0 && (
        <div className="tag-cloud">
          {problem.tagIds.map((tid) => (
            <span key={tid} className="tag-chip">{getTagName(tid)}</span>
          ))}
        </div>
      )}

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
      {problem.answerEnabled && (
        <section className="panel">
          <h2 className="section-title">正解</h2>
          <div className="tile-row">
            {problem.acceptedDiscards.map((c, i) => (
              <TileFace key={i} code={c} size={36} />
            ))}
          </div>
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
      {problem.attachments.length > 0 && (
        <div className="attach-grid">
          {problem.attachments.map((a) => (
            <img key={a.id} src={a.dataUrl} alt="参考画像" />
          ))}
        </div>
      )}

      <div className="btn-row wrap">
        <Link className="btn" to={`/edit/${problem.id}`}>編集</Link>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const r = duplicateProblem(problem.id);
            if (r.ok) {
              const newest = r.store.problems[r.store.problems.length - 1];
              if (newest) navigate(`/problems/${newest.id}`);
            } else setMsg(r.reason);
          }}
        >
          複製
        </button>
        <button type="button" className="btn" onClick={onPng}>PNG保存</button>
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

      {pngPreview && (
        <section className="panel">
          <h2 className="section-title">PNGプレビュー</h2>
          <img src={pngPreview} alt="牌姿PNG" className="png-preview" />
          <p className="hint">ダウンロードできない場合はこの画像を長押しして保存してください。</p>
        </section>
      )}
      {msg && <p className="ok">{msg}</p>}
    </div>
  );
}
