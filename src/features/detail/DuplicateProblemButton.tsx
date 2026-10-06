import { useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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
    {open && <ConfirmDialog
      title="問題を複製しますか？"
      description={`「${title.trim() || '無題の問題'}」を複製します。`}
      confirmLabel="複製する"
      returnFocus={trigger.current}
      onCancel={() => setOpen(false)}
      onConfirm={() => {
        setOpen(false);
        onDuplicate();
      }}
    />}
  </>;
}
