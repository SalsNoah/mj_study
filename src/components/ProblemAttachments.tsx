import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { attachmentsForRole } from '@/domain/attachments';
import type { Attachment } from '@/domain/types';
import './ProblemAttachments.css';

type AttachmentsProps = {
  attachments: Attachment[];
  sessionKey: string;
};

type GalleryProps = {
  attachments: Attachment[];
  label: string;
  numbered?: boolean;
};

export function QuestionAttachments({ attachments, sessionKey }: AttachmentsProps) {
  return <AttachmentGallery key={sessionKey} attachments={attachmentsForRole(attachments, 'question')} label="問題画像" />;
}

export function ExplanationAttachments({ attachments, sessionKey, visible }: AttachmentsProps & { visible: boolean }) {
  if (!visible) return null;
  return <AttachmentGallery key={sessionKey} attachments={attachmentsForRole(attachments, 'explanation')} label="解説画像" />;
}

/** Also used by the editor, where both roles are intentionally visible. */
export function AttachmentGallery({ attachments, label, numbered = true }: GalleryProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const selectedIndex = attachments.findIndex((attachment) => attachment.id === openId);
  const selected = attachments[selectedIndex];
  const imageLabel = (index: number) => numbered ? `${label} ${index + 1}` : label;

  if (attachments.length === 0) return null;

  return (
    <section className="problem-attachments" aria-label={label}>
      <p className="problem-attachments__heading">{label}<span>タップで拡大</span></p>
      <div className="attach-grid problem-attachments__grid">
        {attachments.map((attachment, index) => (
          <button
            key={attachment.id}
            type="button"
            className="attachment-thumbnail"
            aria-label={`${imageLabel(index)} を拡大`}
            aria-haspopup="dialog"
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setOpenId(attachment.id);
            }}
          >
            <img src={attachment.dataUrl} alt={imageLabel(index)} />
          </button>
        ))}
      </div>
      {selected && (
        <AttachmentViewer
          key={selected.id}
          attachment={selected}
          label={imageLabel(selectedIndex)}
          onClose={() => setOpenId(null)}
          returnFocus={trigger.current}
        />
      )}
    </section>
  );
}

function AttachmentViewer({ attachment, label, onClose, returnFocus }: {
  attachment: Attachment;
  label: string;
  onClose: () => void;
  returnFocus: HTMLElement | null;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [fullSize, setFullSize] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const panel = dialog.current!;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();

    const keepFocusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.contains(event.target)) closeButton.current?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      } else if (event.key === 'Tab') {
        const focusable = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
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
    <div
      className="attachment-viewer-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialog} className="attachment-viewer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="attachment-viewer__header">
          <h2 id={titleId}>{label}</h2>
          <button ref={closeButton} type="button" className="btn" onClick={onClose}>閉じる</button>
        </header>
        <div className="attachment-viewer__tools">
          <button type="button" className="btn" aria-pressed={fullSize} onClick={() => setFullSize(!fullSize)}>
            {fullSize ? '画面に合わせる' : '原寸で表示'}
          </button>
        </div>
        <div className={`attachment-viewer__viewport${fullSize ? ' is-full-size' : ''}`} tabIndex={0} aria-label="拡大画像（スクロールできます）">
          <img src={attachment.dataUrl} alt={label} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
