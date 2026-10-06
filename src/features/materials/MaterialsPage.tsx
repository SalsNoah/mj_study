import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '@/app/store';
import { createId, nowIso } from '@/domain/ids';
import { countMaterialStudies, MATERIAL_LIMITS, normalizeMaterialUrl } from '@/domain/materials';
import { materialHost } from './materialPresentation';
import { filterMaterials } from './materialList';
import { MaterialThumbnail } from './MaterialThumbnail';

export function MaterialsPage() {
  const { store, saveMaterial, externalConflict } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const archived = searchParams.get('view') === 'archived';
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const saving = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const draftId = useRef(createId('material'));
  const materials = [...(store.materials ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const archivedCount = materials.filter((material) => material.archivedAt !== undefined).length;
  const selectedMaterials = materials.filter((material) => (material.archivedAt !== undefined) === archived);
  const visibleMaterials = filterMaterials(selectedMaterials, query);
  const duplicateArchived = materials.some((material) => material.id === duplicateId && material.archivedAt !== undefined);

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
        <p className="count-pill" aria-live="polite">{query.trim() ? `${visibleMaterials.length.toLocaleString('ja-JP')} / ` : ''}{selectedMaterials.length.toLocaleString('ja-JP')} 件</p>
      </header>

      <div className="material-views" role="group" aria-label="教材の表示">
        <button className="btn" type="button" aria-pressed={!archived} onClick={() => setSearchParams((previous) => {
          const next = new URLSearchParams(previous); next.delete('view'); return next;
        })}>学習中 {materials.length - archivedCount} 件</button>
        <button className="btn" type="button" aria-pressed={archived} onClick={() => setSearchParams((previous) => {
          const next = new URLSearchParams(previous); next.set('view', 'archived'); return next;
        })}>アーカイブ {archivedCount} 件</button>
      </div>

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
            {duplicateId && <> <Link to={`/materials/${encodeURIComponent(duplicateId)}`}>{duplicateArchived ? 'アーカイブした教材を開いて復元' : '登録済みの教材を開く'}</Link></>}
          </p>}
          {externalConflict && <p className="error" role="alert">別タブの更新を再読込してから登録してください。</p>}
          <div className="btn-row">
            <button className="btn btn-primary" type="submit" disabled={externalConflict}>登録する</button>
            {materials.length > 0 && <button className="btn" type="button" onClick={() => setShowForm(false)}>閉じる</button>}
          </div>
        </form>
      ) : <button className="btn btn-primary materials-add" type="button" onClick={() => setShowForm(true)}>教材を追加</button>}

      {materials.length > 0 && <div className="material-search">
        <label className="field">
          <span className="sr-only">教材を検索</span>
          <input ref={searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="タイトル・URLで検索" />
        </label>
        {query && <button className="btn" type="button" onClick={() => { setQuery(''); searchInput.current?.focus(); }}>検索をクリア</button>}
      </div>}
      {selectedMaterials.length === 0 ? <div className="empty materials-empty" role="status"><p>{archived ? 'アーカイブした教材はありません。' : materials.length === 0 ? '教材はまだありません。' : '学習中の教材はありません。アーカイブから復元できます。'}</p></div> : visibleMaterials.length === 0 ? (
        <div className="empty materials-empty" role="status"><p>条件に合う教材はありません。</p></div>
      ) : (
        <ul className="material-list" aria-label={archived ? "アーカイブした教材" : "登録した教材"}>
          {visibleMaterials.map((material) => (
            <li key={material.id}>
              <article className="material-card">
                <MaterialThumbnail url={material.url} />
                <div className="material-card__body">
                  <h2>{material.title}</h2>
                  <span className="material-count">学習 {countMaterialStudies(store.materialStudyEvents, material.id).toLocaleString('ja-JP')} 回</span>
                  <span className="material-source">{materialHost(material.url)}</span>
                  {material.comment && <p className="material-card__comment">{material.comment}</p>}
                </div>
                <div className="material-card__actions">
                  <a className="btn btn-primary material-direct-link" href={material.url} target="_blank" rel="noopener noreferrer"
                    aria-label={`${material.title}のリンクを開く（新しいタブ）`}>リンクを開く <span aria-hidden="true">↗</span></a>
                  <Link className="btn material-record-link" to={`/materials/${encodeURIComponent(material.id)}`}
                    aria-label={`${material.title}の${archived ? '履歴・復元' : '記録・コメント'}`}>{archived ? '履歴・復元' : '記録・コメント'}</Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
