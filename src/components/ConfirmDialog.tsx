import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import '@/features/detail/DuplicateProblemButton.css';

export function ConfirmDialog({ title, description, confirmLabel, danger = false, children, returnFocus, onCancel, onConfirm }: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  children?: ReactNode;
  returnFocus: HTMLElement | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const settled = useRef(false);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  const dismiss = () => {
    if (settled.current) return;
    settled.current = true;
    cancel.current();
  };

  useEffect(() => {
    const dialog = panel.current!;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelButton.current?.focus();

    const keepFocusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) cancelButton.current?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      } else if (event.key === 'Tab') {
        const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', keepFocusInside);
      document.body.style.overflow = oldOverflow;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [returnFocus]);

  return createPortal(
    <div className="duplicate-confirmation-backdrop" onClick={(event) => {
      if (event.target === event.currentTarget) dismiss();
    }}>
      <div ref={panel} className="duplicate-confirmation" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {children}
        <div className="duplicate-confirmation__actions">
          <button ref={cancelButton} type="button" className="btn" onClick={dismiss}>キャンセル</button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => {
            if (settled.current) return;
            settled.current = true;
            onConfirm();
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
