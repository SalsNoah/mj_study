import { useRef, useState } from 'react';
import { useApp } from '@/app/store';
import { ViewTabs, viewPanelProps } from '@/components/ViewTabs';
import { LIMITS } from '@/domain/types';
import { createSampleProblems, samplesAlreadyPresent } from '@/data/samples';
import { THEMES, loadTheme, saveTheme, type ThemeId } from '@/app/theme';

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
  const [view, setView] = useState('display');
  const [msg, setMsg] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>(loadTheme);
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
    <div className="page page--settings">
      <header className="page-header page-header--compact">
        <h1>設定</h1>
      </header>

      {(msg || lastError) && <p className={lastError ? 'error' : 'ok'} role={lastError ? 'alert' : 'status'}>{lastError ?? msg}</p>}
      {sizeLevel !== 'ok' && (
        <p className="warn" role="alert">{sizeLevel === 'over' ? '保存量が4MiBを超えています。' : '保存量が3MiBを超えています。'}「データ管理」でバックアップを保存してください。</p>
      )}
      <ViewTabs
        id="settings-view"
        label="設定の分類"
        value={view}
        onChange={setView}
        tabs={[{ value: 'display', label: '表示・編集' }, { value: 'data', label: 'データ管理' }]}
      />
      <div {...viewPanelProps('settings-view', 'display', view)}>
      <section className="panel">
        <h2 className="section-title">テーマ</h2>
        <div className="theme-picker" role="radiogroup" aria-label="テーマ">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              className={`theme-option${theme === t.id ? ' is-on' : ''}`}
              onClick={() => {
                saveTheme(t.id);
                setTheme(t.id);
              }}
            >
              <span className="theme-swatch" data-theme={t.id} aria-hidden>
                <span className="theme-swatch__panel">
                  <span className="theme-swatch__line" />
                  <span className="theme-swatch__line theme-swatch__line--short" />
                  <span className="theme-swatch__btn" />
                </span>
              </span>
              <strong>{t.name}</strong>
              <small>{t.desc}</small>
            </button>
          ))}
        </div>
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

      </div>
      <div {...viewPanelProps('settings-view', 'data', view)}>
      <section className="panel">
        <h2 className="section-title">このブラウザのデータ</h2>
        <p>{store.problems.length} 問・約 {(sizeBytes / (1024 * 1024)).toFixed(2)} MiB</p>
        <p className="hint">自動同期はありません。ブラウザのデータ削除で消えます。</p>
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

      <details className="details panel">
        <summary>タグ管理（{store.tags.length}件）</summary>
        {store.tags.length === 0 && <p className="hint">問題の作成画面でタグを追加できます。</p>}
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
      </details>

      <details className="details panel">
        <summary>サンプル問題</summary>
        <button type="button" className="btn" onClick={addSamples}>
          サンプルを追加
        </button>
      </details>

      <details className="details panel settings-danger">
        <summary>すべてのデータを削除</summary>
        <p className="hint">問題・履歴・画像が消えます。先にバックアップを保存してください。</p>
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
      </details>

      </div>
    </div>
  );
}
