import { useEffect, useRef, useState } from 'react';
import { attachmentRole, type AttachmentRole } from '@/domain/attachments';
import { LIMITS, type Attachment } from '@/domain/types';
import { AttachmentGallery } from './ProblemAttachments';

export type AttachmentEditorProps = {
  attachments: Attachment[];
  onChange: (attachments: Attachment[]) => void;
  onImage: (file: File | null, role: AttachmentRole) => void | Promise<void>;
  imageMessage?: string | null;
  sessionKey: string;
};

export function AttachmentEditor(props: AttachmentEditorProps) {
  return <AttachmentEditorFields key={props.sessionKey} {...props} />;
}

function AttachmentEditorFields({ attachments, onChange, onImage, imageMessage }: AttachmentEditorProps) {
  const [loading, setLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadLock = useRef(false);
  const movedImage = useRef<string | null>(null);
  const moveButtons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (movedImage.current) {
      moveButtons.current.get(movedImage.current)?.focus();
      movedImage.current = null;
    }
  }, [attachments]);

  return (
    <div className="attachment-editor">
      <p className="attachment-editor__heading">画像（合計{LIMITS.attachmentsMax}枚まで）</p>
      {loading && <p className="hint" role="status">画像を準備中…</p>}
      {(uploadError || imageMessage) && <p className="error" role="status">{uploadError || imageMessage}</p>}
      {attachments.length >= LIMITS.attachmentsMax && <p className="hint">画像は合計{LIMITS.attachmentsMax}枚までです。</p>}
      <div className="attachment-editor__sections">
        {(['question', 'explanation'] as const).map((role) => {
          const label = role === 'question' ? '問題画像' : '解説画像';
          const otherRole = role === 'question' ? 'explanation' : 'question';
          const moveLabel = role === 'question' ? '解説用へ移す' : '問題用へ移す';
          return <section key={role} className="attachment-editor__section" aria-label={label}>
            <h3 className="attachment-editor__section-heading">{label}{role === 'question' && <span>回答前にも表示</span>}</h3>
            <label className="field">
              <span className="sr-only">{label}を追加</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={loading || attachments.length >= LIMITS.attachmentsMax}
                onChange={async (event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = '';
                  if (!file || uploadLock.current || attachments.length >= LIMITS.attachmentsMax) return;
                  uploadLock.current = true;
                  setLoading(true);
                  setUploadError(null);
                  try {
                    await onImage(file, role);
                  } catch {
                    setUploadError('画像を追加できませんでした。もう一度お試しください。');
                  } finally {
                    uploadLock.current = false;
                    setLoading(false);
                  }
                }}
              />
            </label>
            <div className="attachment-editor__items">
              {attachments.map((attachment, index) => attachmentRole(attachment) === role && (
                <div key={attachment.id} className="attachment-editor__item">
                  <AttachmentGallery attachments={[attachment]} label={`画像 ${index + 1}`} numbered={false} />
                  <div className="btn-row">
                    <button
                      ref={(element) => { if (element) moveButtons.current.set(attachment.id, element); else moveButtons.current.delete(attachment.id); }}
                      type="button"
                      className="btn"
                      aria-label={`画像 ${index + 1} を${moveLabel}`}
                      onClick={() => {
                        movedImage.current = attachment.id;
                        onChange(attachments.map((item) => item.id === attachment.id ? { ...item, role: otherRole } : item));
                      }}
                    >{moveLabel}</button>
                    <button type="button" className="btn btn-danger" aria-label={`画像 ${index + 1} を削除`} onClick={() => onChange(attachments.filter((item) => item.id !== attachment.id))}>
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>;
        })}
      </div>
    </div>
  );
}
