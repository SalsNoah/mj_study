import { useId, useState } from 'react';
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
  const labelId = useId();
  const [newRole, setNewRole] = useState<AttachmentRole>('explanation');
  const [loading, setLoading] = useState(false);
  return (
    <div className="attachment-editor">
      <p className="attachment-editor__heading">画像（合計{LIMITS.attachmentsMax}枚まで）</p>
      <label className="field">
        <span id={`${labelId}-new-role`}>追加する画像の表示先</span>
        <select aria-labelledby={`${labelId}-new-role`} value={newRole} onChange={(event) => setNewRole(event.target.value === 'question' ? 'question' : 'explanation')}>
          <option value="question">問題に表示（回答前も表示）</option>
          <option value="explanation">解説に表示</option>
        </select>
      </label>
      <label className="field">
        <span>画像を追加</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={loading || attachments.length >= LIMITS.attachmentsMax}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            event.currentTarget.value = '';
            if (!file || loading) return;
            setLoading(true);
            try { await onImage(file, newRole); } finally { setLoading(false); }
          }}
        />
      </label>
      {loading && <p className="hint" role="status">画像を準備中…</p>}
      {imageMessage && <p className="error" role="status">{imageMessage}</p>}
      {attachments.length >= LIMITS.attachmentsMax && <p className="hint">画像は合計{LIMITS.attachmentsMax}枚までです。</p>}
      <div className="attachment-editor__items">
        {attachments.map((attachment, index) => (
          <div key={attachment.id} className="attachment-editor__item">
            <AttachmentGallery attachments={[attachment]} label={`画像 ${index + 1}`} numbered={false} />
            <label className="field">
              <span id={`${labelId}-role-${index}`}>画像 {index + 1} の表示先</span>
              <select
                aria-labelledby={`${labelId}-role-${index}`}
                value={attachmentRole(attachment)}
                onChange={(event) => {
                  const role: AttachmentRole = event.target.value === 'question' ? 'question' : 'explanation';
                  onChange(attachments.map((item) => item.id === attachment.id ? { ...item, role } : item));
                }}
              >
                <option value="question">問題に表示（回答前も表示）</option>
                <option value="explanation">解説に表示</option>
              </select>
            </label>
            <button type="button" className="btn btn-danger" aria-label={`画像 ${index + 1} を削除`} onClick={() => onChange(attachments.filter((item) => item.id !== attachment.id))}>
              削除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
