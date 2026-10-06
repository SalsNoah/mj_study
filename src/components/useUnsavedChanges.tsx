import { useCallback, useEffect, useRef } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';
import { ConfirmDialog } from './ConfirmDialog';

/** Requires the same data router in production and tests; never silently skips blocking. */
export function useUnsavedChanges({ dirty, onSave, saveDisabled = false }: {
  dirty: boolean;
  onSave: () => boolean;
  saveDisabled?: boolean;
}) {
  const leaving = useRef(false);
  const currentDirty = useRef(dirty);
  currentDirty.current = dirty;
  const returnFocus = useRef<HTMLElement | null>(null);
  const shouldBlock = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    // Query/fragment changes keep these editor instances and their draft intact.
    const changed = currentLocation.pathname !== nextLocation.pathname;
    if (!changed || !currentDirty.current || leaving.current) return false;
    // A newer navigation replaces the router's pending destination, without losing the original focus.
    if (!document.activeElement?.closest('[role="dialog"]')) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    return true;
  }, []);
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!currentDirty.current || leaving.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const leave = (navigate: () => void) => {
    leaving.current = true;
    try { navigate(); } finally { leaving.current = false; }
  };

  return {
    leave,
    dialog: blocker.state === 'blocked' ? <ConfirmDialog
      title="変更を保存しますか？"
      description={saveDisabled ? '画像を準備中です。保存して移動するには、準備が終わるまでお待ちください。' : '変更を保存してから移動しますか？'}
      cancelLabel="この画面に残る"
      confirmLabel="保存して移動"
      confirmDisabled={saveDisabled}
      returnFocus={returnFocus.current}
      onCancel={() => blocker.reset()}
      secondaryAction={{ label: '保存せずに移動', onClick: () => leave(() => blocker.proceed()) }}
      onConfirm={() => {
        // Validation or persistence failure keeps the form and its error available for correction.
        if (onSave()) leave(() => blocker.proceed());
        else blocker.reset();
      }}
    /> : null,
  };
}
