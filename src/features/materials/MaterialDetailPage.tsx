import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useApp } from '@/app/store';
import { createId } from '@/domain/ids';
import { countMaterialStudies, MATERIAL_LIMITS, normalizeMaterialUrl } from '@/domain/materials';
import type { LearningMaterial } from '@/domain/types';
import type { SaveResult } from '@/storage/repository';
import { materialDate, materialFingerprint, materialHistory, materialHost } from './materialPresentation';

export function MaterialDetailPage() {
  const { id } = useParams();
  const { store } = useApp();
  const material = store.materials?.find((item) => item.id === id);
  if (!material) return (
    <div className="page page--materials">
      <h1>教材が見つかりません</h1>
      <Link className="btn" to="/materials">学習教材へ戻る</Link>
    </div>
  );
  return <MaterialDetailEditor key={material.id} material={material} />;
}

function MaterialDetailEditor({ material }: { material: LearningMaterial }) {
  const { store, saveMaterial, recordMaterialStudy, undoMaterialStudy, externalConflict, reload } = useApp();
  const location = useLocation();
  const [baseline, setBaseline] = useState(material);
  const [title, setTitle] = useState(material.title);
  const [url, setUrl] = useState(material.url);
  const [comment, setComment] = useState(material.comment);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(() => location.state?.registered ? '教材を登録しました' : null);
  const [recorded, setRecorded] = useState(false);
  const [conflictError, setConflictError] = useState(false);
  const studyId = useRef(createId('material-study'));
  const studyLocked = useRef(false);
  const studyButton = useRef<HTMLButtonElement>(null);
  const focusNextStudy = useRef(false);
  const metadataDetails = useRef<HTMLDetailsElement>(null);
  const metadataSummary = useRef<HTMLElement>(null);
  const discardOnReload = useRef(false);
  const metadataDirty = title !== baseline.title || url !== baseline.url;
  const dirty = metadataDirty || comment !== baseline.comment;
  const stale = materialFingerprint(material) !== materialFingerprint(baseline);
  const blocked = externalConflict || stale || conflictError;
  const events = materialHistory(store.materialStudyEvents, material.id);
  const latestEvent = events[0];
  const safeLink = normalizeMaterialUrl(material.url);

  useEffect(() => {
    if (discardOnReload.current || (!dirty && stale && !externalConflict)) {
      discardOnReload.current = false;
      setBaseline(material);
      setTitle(material.title);
      setUrl(material.url);
      setComment(material.comment);
      setConflictError(false);
      setError(null);
      setDuplicateId(null);
    }
  }, [material, dirty, stale, externalConflict]);

  useEffect(() => {
    if (!recorded && focusNextStudy.current) {
      focusNextStudy.current = false;
      // The old action disappears, so focus after React enables the study button.
      if (studyButton.current?.disabled) metadataSummary.current?.focus();
      else studyButton.current?.focus();
    }
  }, [recorded]);

  const receive = (result: SaveResult, success: string): LearningMaterial | null => {
    setMessage(null);
    setDuplicateId(null);
    if (!result.ok) {
      setError(result.reason);
      setDuplicateId(result.duplicateMaterialId ?? null);
      if (result.code === 'conflict') setConflictError(true);
      return null;
    }
    const saved = result.store.materials?.find((item) => item.id === material.id);
    if (!saved) return null;
    setBaseline(saved);
    setError(null);
    setMessage(success);
    return saved;
  };

  const saveMetadata = (event: FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    const normalized = normalizeMaterialUrl(url);
    if (!normalized.ok) {
      setError(normalized.reason);
      setMessage(null);
      return;
    }
    const saved = receive(saveMaterial({ ...baseline, title: title.trim() || materialHost(normalized.url), url: normalized.url }), '教材情報を保存しました');
    if (saved) {
      setTitle(saved.title);
      setUrl(saved.url);
      if (metadataDetails.current) metadataDetails.current.open = false;
      metadataSummary.current?.focus();
    }
  };

  const saveComment = () => {
    if (blocked) return;
    const saved = receive(saveMaterial({ ...baseline, comment }), 'コメントを保存しました');
    if (saved) setComment(saved.comment);
  };

  const recordStudy = () => {
    if (blocked || metadataDirty || studyLocked.current) return;
    studyLocked.current = true;
    const saved = receive(recordMaterialStudy(material.id, comment, studyId.current), '学習を記録しました');
    if (saved) {
      setComment(saved.comment);
      setRecorded(true);
    } else studyLocked.current = false;
  };

  const undoStudy = () => {
    if (blocked || !latestEvent) return;
    const saved = receive(undoMaterialStudy(latestEvent.id), '学習記録を取り消しました');
    if (saved) {
      studyLocked.current = false;
      studyId.current = createId('material-study');
      setRecorded(false);
    }
  };

  const startNextStudy = () => {
    studyId.current = createId('material-study');
    studyLocked.current = false;
    focusNextStudy.current = true;
    setRecorded(false);
    setMessage(null);
  };

  return (
    <div className="page page--materials page--material-detail">
      <Link className="material-back" to="/materials">‹ 学習教材</Link>
      <header className="page-header material-detail-heading">
        <h1>{material.title}</h1>
        <p className="material-count">学習 {countMaterialStudies(store.materialStudyEvents, material.id).toLocaleString('ja-JP')} 回</p>
      </header>

      <section className="panel material-content" aria-label="教材">
        <p className="material-source">{materialHost(material.url)}</p>
        {safeLink.ok && <a className="btn btn-primary material-open" href={safeLink.url} target="_blank" rel="noopener noreferrer">教材を開く <span aria-hidden="true">↗</span><span className="sr-only">（新しいタブ）</span></a>}
        <details className="material-edit" ref={metadataDetails}>
          <summary ref={metadataSummary}>タイトル・URLを編集</summary>
          <form onSubmit={saveMetadata} noValidate>
            <label className="field"><span>タイトル</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={MATERIAL_LIMITS.title} />
            </label>
            <label className="field"><span>URL</span>
              <input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                value={url} onChange={(event) => setUrl(event.target.value)} maxLength={MATERIAL_LIMITS.url} required />
            </label>
            <button className="btn" type="submit" disabled={blocked}>教材情報を保存</button>
          </form>
        </details>
      </section>

      {blocked && <div className="material-conflict" role="alert">
        <p>保存内容が別の画面で更新されています。入力内容を残したまま、上書きを止めています。</p>
        <button className="btn" type="button" onClick={() => {
          discardOnReload.current = true;
          reload();
        }}>入力を破棄して再読込</button>
      </div>}
      {error && <p className="error" role="alert">{error}
        {duplicateId && <> <Link to={`/materials/${encodeURIComponent(duplicateId)}`}>登録済みの教材を開く</Link></>}
      </p>}

      <section className="panel material-study" aria-label="教材の学習">
        <label className="field"><span>コメント</span>
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={MATERIAL_LIMITS.comment}
            placeholder="学んだこと・次に見返したいこと" />
        </label>
        <div className="material-study__actions">
          <button className="btn" type="button" disabled={blocked} onClick={saveComment}>コメントを保存</button>
          <button className="btn btn-primary" type="button" ref={studyButton} disabled={blocked || metadataDirty || recorded} onClick={recordStudy}>学習した</button>
        </div>
        {metadataDirty && <p className="hint">教材情報を保存してから学習を記録してください。</p>}
        {message && <p className="material-status" role="status">{message}</p>}
        {recorded && <button className="btn material-next" type="button" disabled={blocked} onClick={startNextStudy}>次の学習を記録する</button>}
      </section>

      <section className="panel material-history" aria-labelledby="material-history-heading">
        <div className="material-history__heading">
          <h2 className="section-title" id="material-history-heading">学習の履歴</h2>
          {latestEvent && <button className="btn" type="button" disabled={blocked} onClick={undoStudy}>直前の学習を取り消す</button>}
        </div>
        {events.length === 0 ? <p className="hint">学習の記録はまだありません。</p> : <ol className="material-history-list">
          {events.map((event) => {
            const eventLink = normalizeMaterialUrl(event.url);
            return <li key={event.id}>
              <time dateTime={event.at}>{materialDate(event.at)}</time>
              <strong>{event.title}</strong>
              {eventLink.ok && <a href={eventLink.url} target="_blank" rel="noopener noreferrer" className="material-history__source">{materialHost(event.url)}<span className="sr-only">（新しいタブ）</span></a>}
              {event.comment && <p>{event.comment}</p>}
            </li>;
          })}
        </ol>}
      </section>
    </div>
  );
}
