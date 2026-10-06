import { useMemo } from 'react';
import { createHashRouter, Navigate, Route, RouterProvider, Routes, useLocation, useNavigate, type RouterProviderProps } from 'react-router-dom';
import { AppProvider, useApp } from './store';
import { RouteScroll } from '@/components/RouteScroll';
import { BottomNav } from '@/components/BottomNav';
import { LibraryPage } from '@/features/library/LibraryPage';
import { EditorPage } from '@/features/editor/EditorPage';
import { DetailPage } from '@/features/detail/DetailPage';
import { TestPage } from '@/features/test/TestPage';
import { RecordsPage } from '@/features/records/RecordsPage';
import { MaterialsPage } from '@/features/materials/MaterialsPage';
import { MaterialDetailPage } from '@/features/materials/MaterialDetailPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { ImportPage } from '@/features/import/ImportPage';
import { ShareReceivePage } from '@/features/share/ShareReceivePage';
import { parseShareFromHash } from '@/domain/share';
import './styles.css';
import '@/features/materials/materials.css';
import './themeBackgrounds.css';
import './dopa.css';
import './moe.css';

/** 仕様の #share=v1... を HashRouter の #/path と切り分ける */
function readSharePayload(): string | null {
  const hash = window.location.hash;
  return hash.startsWith('#share=') ? parseShareFromHash(hash) : null;
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
  const location = useLocation();
  const navigate = useNavigate();
  const share = useMemo(readSharePayload, [location]);

  if (share !== null) {
    return (
      <CorruptGate>
        <ShareReceivePage key={share} encoded={share} />
        <div className="page" style={{ paddingTop: 0 }}>
          <button
            type="button"
            className="btn"
            onClick={() => navigate('/library')}
          >
            学習帳へ戻る
          </button>
        </div>
      </CorruptGate>
    );
  }

  return (
    <>
      <RouteScroll />
      <CorruptGate>
        <Routes>
          <Route path="/" element={<EditorPage />} />
          <Route path="/new" element={<Navigate to="/" replace />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/edit/:id" element={<EditorPage />} />
          <Route path="/problems/:id" element={<DetailPage />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="/review" element={<Navigate to="/test" replace />} />
          <Route path="/records" element={<RecordsPage />} />
          <Route path="/materials" element={<MaterialsPage />} />
          <Route path="/materials/:id" element={<MaterialDetailPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomNav />
      </CorruptGate>
    </>
  );
}

export function createAppRouter() {
  return createHashRouter([{ path: '*', element: <AppRoutes /> }]);
}

export default function App({ router }: { router: RouterProviderProps['router'] }) {
  return (
    <AppProvider>
      <div className="app-shell">
        <RouterProvider router={router} />
      </div>
    </AppProvider>
  );
}
