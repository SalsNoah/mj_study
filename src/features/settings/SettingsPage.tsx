import { useRef, useState } from 'react';
import { useApp } from '@/app/store';
import { LIMITS } from '@/domain/types';
import { createSampleProblems, samplesAlreadyPresent } from '@/data/samples';

export function SettingsPage() {
  const {
    store,
    sizeBytes,
    sizeLevel,
    updateSettings,
    exportJson,
    importJson,
    clearAll,
    addProblems,
    renameTag,
    deleteTag,
    lastError,
  } = useApp();
  const [msg, setMsg] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<{
    text: string;
    problems: number;
    images: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadBackup = () => {
    const text = exportJson();
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mahjong-study-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setMsg('バックアップをダウンロードしました');
  };

  const onImportFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > LIMITS.backupMaxBytes) {
      setMsg('ファイルが20MiBを超えています');
      return;
    }
    const text = await file.text();
    try {
      const parsed = JSON.parse(text) as { problems?: unknown[] };
      const problems = Array.isArray(parsed.problems) ? parsed.problems.length : 0;
      const images = Array.isArray(parsed.problems)
        ? parsed.problems.reduce((n: number, p: unknown) => {
            const atts = (p as { attachments?: unknown[] }).attachments;
            return n + (Array.isArray(atts) ? atts.length : 0);
          }, 0)
        : 0;
      setImportPreview({ text, problems, images });
    } catch {
      setMsg('JSONの解析に失敗しました');
    }
  };

  const addSamples = () => {
    if (samplesAlreadyPresent(store)) {
      setMsg('サンプルは既に追加済みです（重複作成しません）');
      return;
    }
    const { problems, tagName } = createSampleProblems();
    const r = addProblems(problems, tagName);
    setMsg(r.ok ? 'サンプルを追加しました' : r.reason);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>設定</h1>
      </header>

      <section className="panel">
        <h2 className="section-title">保存量の目安</h2>
        <p>
          約 {(sizeBytes / (1024 * 1024)).toFixed(2)} MiB
          {sizeLevel === 'warn' && '（3MiB超過：注意）'}
          {sizeLevel === 'over' && '（4MiB上限超過）'}
        </p>
        <p className="hint">
          データはこのブラウザの localStorage にのみ保存されます。ブラウザのデータ削除で消え、別端末には自動同期されません。
        </p>
      </section>

      <section className="panel">
        <h2 className="section-title">編集設定</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={store.settings.autoSort}
            onChange={(e) => updateSettings({ autoSort: e.target.checked })}
          />
          手牌の自動理牌（初期ON）
        </label>
      </section>

      <section className="panel">
        <h2 className="section-title">タグ管理</h2>
        <ul className="tag-admin">
          {store.tags.map((t) => (
            <li key={t.id}>
              <input
                defaultValue={t.name}
                onBlur={(e) => {
                  if (e.target.value !== t.name) {
                    const r = renameTag(t.id, e.target.value);
                    if (!r.ok) setMsg(r.reason);
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (!window.confirm(`タグ「${t.name}」を削除しますか？（問題は残ります）`)) return;
                  deleteTag(t.id);
                }}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="section-title">バックアップ</h2>
        <div className="btn-row wrap">
          <button type="button" className="btn btn-primary" onClick={downloadBackup}>
            JSONバックアップ
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            JSON復元…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => onImportFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {importPreview && (
          <div className="import-preview">
            <p>
              問題 {importPreview.problems} 件 / 画像 {importPreview.images} 枚
            </p>
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const r = importJson(importPreview.text, 'merge');
                  setMsg(r.ok ? '追加で取り込みました' : r.reason);
                  if (r.ok) setImportPreview(null);
                }}
              >
                追加
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (
                    !window.confirm(
                      '現在のデータを全置換します。直前にバックアップを取ってください。続行しますか？',
                    )
                  ) {
                    return;
                  }
                  const r = importJson(importPreview.text, 'replace');
                  setMsg(r.ok ? '全置換しました' : r.reason);
                  if (r.ok) setImportPreview(null);
                }}
              >
                全置換
              </button>
              <button type="button" className="btn" onClick={() => setImportPreview(null)}>
                キャンセル
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="section-title">サンプル</h2>
        <button type="button" className="btn" onClick={addSamples}>
          サンプルを追加
        </button>
      </section>

      <section className="panel">
        <h2 className="section-title">全件削除</h2>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (
              !window.confirm(
                'すべての問題・履歴・画像を削除します。直前バックアップを推奨します。本当に削除しますか？',
              )
            ) {
              return;
            }
            const r = clearAll();
            setMsg(r.ok ? 'すべて削除しました' : r.reason);
          }}
        >
          全件削除
        </button>
      </section>

      {(msg || lastError) && <p className={lastError ? 'error' : 'ok'}>{lastError ?? msg}</p>}
    </div>
  );
}
