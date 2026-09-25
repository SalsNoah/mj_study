import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  LocalStorageRepository,
  estimateStoreSize,
  sizeStatus,
  type LoadResult,
  type SaveResult,
} from '@/storage/repository';
import { emptyStore, type Attempt, type Problem, type Settings, type Store, type StudyState, type Tag } from '@/domain/types';
import type { SharePayload } from '@/domain/share';

type AppState = {
  store: Store;
  loadError: Extract<LoadResult, { ok: false }> | null;
  corruptRaw: string | null;
  externalConflict: boolean;
  busy: boolean;
  lastError: string | null;
  sizeBytes: number;
  sizeLevel: 'ok' | 'warn' | 'over';
  reload: () => void;
  clearError: () => void;
  dismissConflict: () => void;
  saveProblem: (problem: Problem, isNew: boolean) => SaveResult;
  deleteProblem: (id: string) => SaveResult;
  duplicateProblem: (id: string) => SaveResult;
  confirmProblem: (id: string) => SaveResult;
  undoConfirm: (id: string, previous: StudyState) => SaveResult;
  recordAttempt: (attempt: Attempt, understanding?: StudyState['understanding']) => SaveResult;
  updateUnderstanding: (id: string, u: StudyState['understanding']) => SaveResult;
  updateSettings: (settings: Settings) => SaveResult;
  upsertTag: (name: string) => SaveResult | { ok: true; store: Store; tag: Tag };
  renameTag: (id: string, name: string) => SaveResult;
  deleteTag: (id: string) => SaveResult;
  clearAll: () => SaveResult;
  exportJson: () => string;
  importJson: (text: string, mode: 'merge' | 'replace') => SaveResult;
  addFromShare: (payload: SharePayload) => SaveResult;
  addProblems: (problems: Problem[], tagName?: string) => SaveResult;
  replaceFromEmpty: () => SaveResult;
  getTagName: (id: string) => string;
};

const Ctx = createContext<AppState | null>(null);
const repo = new LocalStorageRepository();

export function AppProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(emptyStore());
  const [loadError, setLoadError] = useState<AppState['loadError']>(null);
  const [corruptRaw, setCorruptRaw] = useState<string | null>(null);
  const [externalConflict, setExternalConflict] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [busy] = useState(false);

  const applySave = useCallback((result: SaveResult): SaveResult => {
    if (result.ok) {
      setStore(result.store);
      setLastError(null);
      setExternalConflict(false);
    } else {
      setLastError(result.reason);
    }
    return result;
  }, []);

  const reload = useCallback(() => {
    const result = repo.load();
    if (result.ok) {
      setStore(result.store);
      setLoadError(null);
      setCorruptRaw(null);
      setExternalConflict(false);
      setLastError(null);
    } else {
      setLoadError(result);
      setCorruptRaw(result.raw ?? null);
    }
  }, []);

  useEffect(() => {
    reload();
    repo.setExternalChangeHandler(() => setExternalConflict(true));
    return () => {
      repo.setExternalChangeHandler(null);
      repo.dispose();
    };
  }, [reload]);

  const sizeBytes = useMemo(() => estimateStoreSize(store), [store]);
  const sizeLevel = sizeStatus(sizeBytes);

  const value: AppState = {
    store,
    loadError,
    corruptRaw,
    externalConflict,
    busy,
    lastError,
    sizeBytes,
    sizeLevel,
    reload,
    clearError: () => setLastError(null),
    dismissConflict: () => setExternalConflict(false),
    saveProblem: (p, isNew) => applySave(repo.saveProblem(store, p, isNew)),
    deleteProblem: (id) => applySave(repo.deleteProblem(store, id)),
    duplicateProblem: (id) => applySave(repo.duplicateProblem(store, id)),
    confirmProblem: (id) => applySave(repo.confirmProblem(store, id)),
    undoConfirm: (id, prev) => applySave(repo.undoConfirm(store, id, prev)),
    recordAttempt: (a, u) => applySave(repo.recordAttempt(store, a, u)),
    updateUnderstanding: (id, u) => applySave(repo.updateUnderstanding(store, id, u)),
    updateSettings: (s) => applySave(repo.updateSettings(store, s)),
    upsertTag: (name) => {
      const r = repo.upsertTag(store, name);
      if (r.ok && 'store' in r) {
        setStore(r.store);
        setLastError(null);
      } else if (!r.ok) {
        setLastError(r.reason);
      }
      return r;
    },
    renameTag: (id, name) => applySave(repo.renameTag(store, id, name)),
    deleteTag: (id) => applySave(repo.deleteTag(store, id)),
    clearAll: () => applySave(repo.clearAll()),
    exportJson: () => repo.exportJson(store),
    importJson: (text, mode) => applySave(repo.importJson(store, text, mode)),
    addFromShare: (payload) => applySave(repo.addFromShare(store, payload)),
    addProblems: (problems, tagName) => applySave(repo.addProblems(store, problems, tagName)),
    replaceFromEmpty: () => applySave(repo.replaceStore(emptyStore())),
    getTagName: (id) => store.tags.find((t) => t.id === id)?.name ?? id,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('AppProvider required');
  return ctx;
}
