import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '@/app/store';
import { createId, nowIso } from '@/domain/ids';
import { countMaterialStudies, MATERIAL_LIMITS, normalizeMaterialUrl } from '@/domain/materials';
import { materialHost } from './materialPresentation';

export function MaterialsPage() {
  const { store, saveMaterial, externalConflict } = useApp();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const saving = useRef(false);
  const draftId = useRef(createId('material'));
  const materials = [...(store.materials ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const register = (event: FormEvent) => {
    event.preventDefault();
    if (saving.current || externalConflict) return;
    setError(null);
    setDuplicateId(null);
    const normalized = normalizeMaterialUrl(url);
    if (!normalized.ok) {
      setError(normalized.reason);
      return;
    }
    saving.current = true;
    const timestamp = nowIso();
    const result = saveMaterial({
      id: draftId.current,
      title: title.trim() || materialHost(normalized.url),
      url: normalized.url,
      comment: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    if (!result.ok) {
      setError(result.reason);
      setDuplicateId(result.duplicateMaterialId ?? null);
      saving.current = false;
      return;
    }
    navigate(`/materials/${encodeURIComponent(draftId.current)}`, { state: { registered: true } });
  };

  return (
    <div className="page page--materials">
      <header className="page-header page-header--compact">
        <h1>学習教材</h1>
        <p className="count-pill">{materials.length.toLocaleString('ja-JP')} 件</p>
      </header>

      {(showForm || materials.length === 0) ? (
        <form className="panel material-form" aria-labelledby="material-add-title" onSubmit={register} noValidate>
          <h2 className="section-title" id="material-add-title">教材を追加</h2>
          <label className="field">
            <span>URL</span>
            <input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              value={url} onChange={(event) => setUrl(event.target.value)} maxLength={MATERIAL_LIMITS.url}
              placeholder="YouTube・note などのURL" required aria-describedby={error ? 'material-add-error' : undefined} />
          </label>
          <label className="field">
            <span>タイトル（任意）</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={MATERIAL_LIMITS.title}
              placeholder="あとで見つけやすい名前" />
          </label>
          {error && <p className="error" role="alert" id="material-add-error">{error}
            {duplicateId && <> <Link to={`/materials/${encodeURIComponent(duplicateId)}`}>登録済みの教材を開く</Link></>}
          </p>}
          {externalConflict && <p className="error" role="alert">別タブの更新を再読込してから登録してください。</p>}
          <div className="btn-row">
            <button className="btn btn-primary" type="submit" disabled={externalConflict}>登録する</button>
            {materials.length > 0 && <button className="btn" type="button" onClick={() => setShowForm(false)}>閉じる</button>}
          </div>
        </form>
      ) : <button className="btn btn-primary materials-add" type="button" onClick={() => setShowForm(true)}>教材を追加</button>}

      {materials.length === 0 ? <div className="empty materials-empty"><p>教材はまだありません。</p></div> : (
        <ul className="material-list" aria-label="登録した教材">
          {materials.map((material) => (
            <li key={material.id}>
              <Link className="material-card" to={`/materials/${encodeURIComponent(material.id)}`}>
                <div className="material-card__heading">
                  <strong>{material.title}</strong>
                  <span className="material-count">学習 {countMaterialStudies(store.materialStudyEvents, material.id).toLocaleString('ja-JP')} 回</span>
                </div>
                <span className="material-source">{materialHost(material.url)}</span>
                {material.comment && <p className="material-card__comment">{material.comment}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
