import { useRef, useState } from 'react';
import { useApp } from '@/app/store';
import { ViewTabs, viewPanelProps } from '@/components/ViewTabs';
import { LIMITS } from '@/domain/types';
import { SampleCatalogManager } from './SampleCatalogManager';
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
    materials: number;
    materialEvents: number;
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
      const parsed = JSON.parse(text) as { problems?: unknown[]; materials?: unknown[]; materialStudyEvents?: unknown[] };
      const problems = Array.isArray(parsed.problems) ? parsed.problems.length : 0;
      const images = Array.isArray(parsed.problems)
        ? parsed.problems.reduce((n: number, p: unknown) => {
            const atts = (p as { attachments?: unknown[] }).attachments;
            return n + (Array.isArray(atts) ? atts.length : 0);
          }, 0)
        : 0;
      setImportPreview({ text, problems, images, materials: Array.isArray(parsed.materials) ? parsed.materials.length : 0, materialEvents: Array.isArray(parsed.materialStudyEvents) ? parsed.materialStudyEvents.length : 0 });
    } catch {
      setMsg('JSONの解析に失敗しました');
    }
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
              tabIndex={theme === t.id ? 0 : -1}
              data-theme-choice={t.id}
              className={`theme-option${theme === t.id ? ' is-on' : ''}`}
              onClick={() => {
                saveTheme(t.id);
                setTheme(t.id);
              }}
              onKeyDown={(event) => {
                const index = THEMES.findIndex((item) => item.id === t.id);
                const offset = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
                  : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
                const next = event.key === 'Home' ? THEMES[0]
                  : event.key === 'End' ? THEMES[THEMES.length - 1]
                    : offset ? THEMES[(index + offset + THEMES.length) % THEMES.length] : undefined;
                if (!next) return;
                event.preventDefault();
                saveTheme(next.id);
                setTheme(next.id);
                event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-theme-choice="${next.id}"]`)?.focus();
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
        <p>{store.problems.length} 問{(store.materials?.length ?? 0) > 0 && `・教材 ${store.materials!.length} 件`}・約 {(sizeBytes / (1024 * 1024)).toFixed(2)} MiB</p>
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
              {(importPreview.materials > 0 || importPreview.materialEvents > 0) && <><br />教材 {importPreview.materials} 件 / 教材の学習記録 {importPreview.materialEvents} 件</>}
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

      <SampleCatalogManager />

      <details className="details panel settings-danger">
        <summary>すべてのデータを削除</summary>
        <p className="hint">問題・履歴・画像・サンプル更新前バックアップが消えます。先にJSONを保存してください。</p>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (
              !window.confirm(
                'すべての問題・履歴・画像・サンプル更新前バックアップを削除します。必要なJSONを保存してください。本当に削除しますか？',
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
      <div className="btn-row">
        <a className="btn" href="https://x.com/Sals_mj" target="_blank" rel="noopener noreferrer" aria-label="製作者のX（新しいタブで開く）">
          製作者のX
        </a>
      </div>
    </div>
  );
}
