import { useState } from 'react';

export type SampleUpdatePreview = {
  candidates: { id: string; title: string }[];
  additions: number;
  preservedEdited: number;
};

export type SampleBackupSummary = {
  id: string;
  createdAt: string;
  restoredAt: string | null;
  removedCount: number;
  addedCount: number;
  state?: 'applied' | 'restored' | 'unapplied';
};

type Outcome = { ok: true } | { ok: false; reason: string };
type Props = {
  inline?: boolean;
  preview: SampleUpdatePreview;
  backups: SampleBackupSummary[];
  backupError: string | null;
  onApply: (selectedIds: string[]) => Outcome;
  onRestore: (backupId: string) => Outcome;
  onExportBackup: (backupId: string) => { ok: true; text: string } | { ok: false; reason: string };
};

export function SampleCatalogSettings({ inline = false, preview, backups, backupError, onApply, onRestore, onExportBackup }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const selectedIds = preview.candidates.filter((p) => selected.has(p.id)).map((p) => p.id);
  const noChange = preview.additions === 0 && selectedIds.length === 0;

  const downloadOriginal = (id: string) => {
    const result = onExportBackup(id);
    if (!result.ok) { setMessage({ error: true, text: result.reason }); return; }
    const url = URL.createObjectURL(new Blob([result.text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `mahjong-study-before-samples-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const content = <>
    <p>新サンプル10題：正解あり8題・正解なし2題</p>
    {preview.preservedEdited > 0 && <p className="hint">編集したサンプル {preview.preservedEdited} 題はそのまま残します。</p>}
    {preview.candidates.length > 0 && <fieldset className="sample-candidates">
      <legend>削除する旧問題を選択</legend>
      <p className="hint">旧サンプルと全内容が一致する問題です。選ばない問題は残します。</p>
      <button type="button" className="btn" onClick={() => setSelected(
        selectedIds.length === preview.candidates.length ? new Set() : new Set(preview.candidates.map((p) => p.id)),
      )}>{selectedIds.length === preview.candidates.length ? '選択を解除' : '旧候補をまとめて選択'}</button>
      {preview.candidates.map((p) => <label className="check" key={p.id}>
        <input type="checkbox" checked={selected.has(p.id)} onChange={(event) => setSelected((previous) => {
          const next = new Set(previous);
          if (event.target.checked) next.add(p.id); else next.delete(p.id);
          return next;
        })} />
        <span>{p.title || '無題の問題'}</span>
      </label>)}
    </fieldset>}
    <p className="hint">更新前のデータをこのブラウザに保存してから更新します。</p>
    <button type="button" className="btn" disabled={noChange || !!backupError} onClick={() => {
      const result = onApply(selectedIds);
      setMessage(result.ok ? { error: false, text: 'サンプルを更新しました。' } : { error: true, text: result.reason });
      if (result.ok) setSelected(new Set());
    }}>
      {noChange ? 'この10題は追加済み' : selectedIds.length > 0
        ? preview.additions === 0 ? `選択した旧${selectedIds.length}題を削除` : `旧${selectedIds.length}題を削除して${preview.additions}題を追加`
        : preview.candidates.length > 0 ? `旧問題を残して${preview.additions}題を追加` : `サンプル${preview.additions}題を追加`}
    </button>
    {(message || backupError) && <p className={backupError || message?.error ? 'error' : 'ok'} role={backupError || message?.error ? 'alert' : 'status'}>
      {backupError ?? message?.text}
    </p>}
    {backups.length > 0 && <details className="details sample-backups">
      <summary>更新前バックアップ（{backups.length}件）</summary>
      <p className="hint">この更新で追加した未編集・未学習の問題を取り除き、旧問題を戻します。編集・学習済みの問題は残します。</p>
      {backups.map((backup) => <section className="sample-backup" key={backup.id}>
        <p>{new Date(backup.createdAt).toLocaleString('ja-JP')}：旧{backup.removedCount}題を削除・{backup.addedCount}題を追加</p>
        <div className="btn-row wrap">
          <button type="button" className="btn" onClick={() => downloadOriginal(backup.id)}>更新前のJSON</button>
          <button type="button" className="btn" disabled={!!backup.restoredAt || backup.state === 'unapplied' || !!backupError} onClick={() => {
            const result = onRestore(backup.id);
            setMessage(result.ok ? { error: false, text: '更新前の問題を復元しました。更新後に編集・学習した問題は残しています。' } : { error: true, text: result.reason });
          }}>{backup.restoredAt ? '復元済み' : backup.state === 'unapplied' ? '更新は未適用' : '更新前の問題を復元'}</button>
        </div>
      </section>)}
    </details>}
  </>;

  return inline ? content : <details className="details panel sample-catalog">
    <summary>サンプル問題</summary>
    {content}
  </details>;
}
