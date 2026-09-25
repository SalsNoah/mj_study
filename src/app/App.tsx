import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './store';
import { BottomNav } from '@/components/BottomNav';
import { LibraryPage } from '@/features/library/LibraryPage';
import { EditorPage } from '@/features/editor/EditorPage';
import { DetailPage } from '@/features/detail/DetailPage';
import { ReviewPage } from '@/features/review/ReviewPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { ShareReceivePage } from '@/features/share/ShareReceivePage';
import './styles.css';

/** 仕様の #share=v1... を HashRouter の #/path と切り分ける */
function readSharePayload(): string | null {
  const raw = window.location.hash;
  if (raw.startsWith('#share=')) {
    return decodeURIComponent(raw.slice('#share='.length));
  }
  return null;
}

function CorruptGate({ children }: { children: React.ReactNode }) {
  const { loadError, corruptRaw, externalConflict, reload } = useApp();
  if (loadError) {
    return (
      <div className="page">
        <h1>データを読み込めません</h1>
        <p className="error">{loadError.reason}</p>
        {corruptRaw && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              const blob = new Blob([corruptRaw], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'mahjong-study-corrupt-export.json';
              a.click();
            }}
          >
            元データを書き出す
          </button>
        )}
        <p className="hint">自動初期化はしません。復旧できない場合のみ設定から全削除を検討してください。</p>
      </div>
    );
  }
  return (
    <>
      {externalConflict && (
        <div className="banner" role="alert">
          別タブでデータが更新されました。上書きを防ぐため再読込してください。
          <button type="button" className="btn" onClick={reload}>
            再読込
          </button>
        </div>
      )}
      {children}
    </>
  );
}

function AppRoutes() {
  const [share, setShare] = useState<string | null>(() => readSharePayload());

  useEffect(() => {
    const onHash = () => setShare(readSharePayload());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (share) {
    return (
      <CorruptGate>
        <ShareReceivePage encoded={share} />
        <div className="page" style={{ paddingTop: 0 }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              window.location.hash = '#/';
              setShare(null);
            }}
          >
            学習帳へ戻る
          </button>
        </div>
      </CorruptGate>
    );
  }

  return (
    <HashRouter>
      <CorruptGate>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/new" element={<EditorPage />} />
          <Route path="/edit/:id" element={<EditorPage />} />
          <Route path="/problems/:id" element={<DetailPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomNav />
      </CorruptGate>
    </HashRouter>
  );
}

export default function App() {
  return (
    <AppProvider>
      <div className="app-shell">
        <AppRoutes />
      </div>
    </AppProvider>
  );
}
