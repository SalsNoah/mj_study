import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '@/app/store';
import type { StudyState } from '@/domain/types';

type Confirmation = { previous: StudyState; revision: number; expiresAt: number };

/** Carry the existing five-second undo across the return to the library. */
export function ConfirmationNotice() {
  const location = useLocation();
  const { store, undoConfirm } = useApp();
  const confirmation = (location.state as { confirmation?: Confirmation } | null)?.confirmation;
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  useEffect(() => {
    if (!confirmation) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, confirmation.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [confirmation]);
  // A consumed, expired, or subsequently changed store cannot replay this undo via browser Back.
  if (!confirmation || now >= confirmation.expiresAt || store.revision !== confirmation.revision) return null;
  return <div className="panel" role="status">
    <span>確認を記録しました。</span>{' '}
    <button type="button" className="btn" onClick={() => {
      if (locked.current || Date.now() >= confirmation.expiresAt) return;
      locked.current = true;
      const result = undoConfirm(confirmation.previous.problemId, confirmation.previous);
      if (!result.ok) { setError(result.reason); locked.current = false; }
    }}>取り消す</button>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
