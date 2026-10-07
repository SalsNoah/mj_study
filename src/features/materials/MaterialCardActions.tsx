import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/app/store';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { createId } from '@/domain/ids';
import type { LearningMaterial } from '@/domain/types';

export function MaterialCardActions({ material, onRemoved }: { material: LearningMaterial; onRemoved: () => void }) {
  const { recordMaterialStudy, setMaterialArchived, externalConflict } = useApp();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'archive' | 'study' | null>(null);
  const recorded = useRef(false);
  const locked = useRef(false);
  const studyId = useRef(createId('material-study'));
  const archiveButton = useRef<HTMLButtonElement>(null);
  const studyButton = useRef<HTMLButtonElement>(null);
  const archived = material.archivedAt !== undefined;
  const record = () => {
    if (locked.current || archived || externalConflict) return;
    locked.current = true;
    const result = recordMaterialStudy(material.id, material.comment, studyId.current);
    setConfirm(null);
    if (result.ok) {
      recorded.current = true;
      setError('');
      setMessage('学習を1回記録しました。');
    } else {
      setError(result.reason);
      setMessage('');
    }
    locked.current = false;
  };
  const archive = () => {
    if (locked.current || externalConflict) return;
    locked.current = true;
    const result = setMaterialArchived(material.id, !archived);
    setConfirm(null);
    if (result.ok) onRemoved();
    else { setError(result.reason); setMessage(''); locked.current = false; }
  };
  return <div className="material-card__actions">
    <div className="material-card__main-actions">
      <a className="btn btn-primary material-direct-link" href={material.url} target="_blank" rel="noopener noreferrer"
        aria-label={`${material.title}の教材を開く（新しいタブ）`}>教材を開く <span aria-hidden="true">↗</span></a>
      <button ref={studyButton} className="btn material-study-action" type="button" disabled={externalConflict || archived}
        aria-label={`${material.title}を学習した`} onClick={() => {
          if (recorded.current) setConfirm('study');
          else record();
        }}>学習した</button>
    </div>
    <div className="material-card__minor-actions">
      <Link className="btn material-record-link" to={`/materials/${encodeURIComponent(material.id)}`}
        aria-label={`${material.title}の${archived ? '履歴・復元' : '記録・コメント'}`}>{archived ? '履歴・復元' : '記録・コメント'}</Link>
      <button ref={archiveButton} className="btn material-archive-action" type="button" disabled={externalConflict}
        aria-label={`${material.title}を${archived ? '学習中に復元' : 'アーカイブ'}`}
        onClick={() => archived ? archive() : setConfirm('archive')}>{archived ? '学習中に復元' : 'アーカイブ'}</button>
    </div>
    {message && <p className="material-card__feedback" role="status">{message}</p>}
    {error && <p className="material-card__feedback error" role="alert">{error}</p>}
    {externalConflict && <p className="material-card__feedback error">別タブの更新を再読込してから操作してください。</p>}
    {confirm && <ConfirmDialog
      title={confirm === 'archive' ? '教材をアーカイブしますか？' : 'もう一度、学習を記録しますか？'}
      description={confirm === 'archive' ? `「${material.title}」を一覧から移します。コメントと学習履歴は残り、いつでも復元できます。` : `「${material.title}」はこの画面で記録済みです。別の学習として1回追加します。`}
      confirmLabel={confirm === 'archive' ? 'アーカイブする' : 'もう1回記録する'}
      confirmDisabled={externalConflict || (confirm === 'study' && archived)}
      returnFocus={confirm === 'archive' ? archiveButton.current : studyButton.current}
      onCancel={() => setConfirm(null)} onConfirm={() => {
        if (confirm === 'archive') archive();
        else { studyId.current = createId('material-study'); record(); }
      }} />}
  </div>;
}
