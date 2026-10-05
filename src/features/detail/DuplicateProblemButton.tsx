import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './DuplicateProblemButton.css';

export function DuplicateProblemButton({ title, onDuplicate }: {
  title: string;
  onDuplicate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return <>
    <button ref={trigger} type="button" className="btn" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      複製
    </button>
    {open && <DuplicateConfirmation
      title={title.trim() || '無題の問題'}
      returnFocus={trigger.current}
      onCancel={() => setOpen(false)}
      onConfirm={() => {
        setOpen(false);
        onDuplicate();
      }}
    />}
  </>;
}

function DuplicateConfirmation({ title, returnFocus, onCancel, onConfirm }: {
  title: string;
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
        <h2 id={titleId}>問題を複製しますか？</h2>
        <p id={descriptionId}>「{title}」を複製します。</p>
        <div className="duplicate-confirmation__actions">
          <button ref={cancelButton} type="button" className="btn" onClick={dismiss}>キャンセル</button>
          <button type="button" className="btn btn-primary" onClick={() => {
            if (settled.current) return;
            settled.current = true;
            onConfirm();
          }}>複製する</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
