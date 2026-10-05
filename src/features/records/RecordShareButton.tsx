import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRecordShareSnapshot, recordShareText, type RecordShareSnapshot } from '@/domain/recordShare';
import type { DailyLog, MaterialStudyEvent } from '@/domain/types';
import { renderRecordShareImage } from './renderRecordShare';
import './recordShare.css';

export function RecordShareButton({ daily, events }: {
  daily: Record<string, DailyLog> | undefined;
  events: readonly MaterialStudyEvent[] | undefined;
}) {
  const [snapshot, setSnapshot] = useState<RecordShareSnapshot | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} type="button" className="btn records-share-trigger" aria-haspopup="dialog"
      onClick={() => setSnapshot(createRecordShareSnapshot(daily, events))}>Xに記録を投稿</button>
    {snapshot && <RecordShareDialog snapshot={snapshot} returnFocus={trigger.current} onClose={() => setSnapshot(null)} />}
  </>;
}

export function xRecordComposeUrl(text: string): string {
  const url = new URL('https://twitter.com/intent/tweet');
  url.searchParams.set('text', text);
  return url.href;
}

function canShareFile(file: File, text: string): boolean {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [file] }) && navigator.canShare({ files: [file], text });
  } catch { return false; }
}

function RecordShareDialog({ snapshot, returnFocus, onClose }: {
  snapshot: RecordShareSnapshot;
  returnFocus: HTMLElement | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const textId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const mounted = useRef(false);
  const sharing = useRef(false);
  const [prepared, setPrepared] = useState<{ file: File; url: string; native: boolean } | null>(null);
  const [imageError, setImageError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const text = recordShareText(snapshot);

  useEffect(() => {
    mounted.current = true;
    const dialog = panel.current!;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const keepFocusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) closeButton.current?.focus();
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      } else if (event.key === 'Tab') {
        const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled])')];
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keys, true);
    document.addEventListener('focusin', keepFocusInside);
    return () => {
      mounted.current = false;
      document.removeEventListener('keydown', keys, true);
      document.removeEventListener('focusin', keepFocusInside);
      document.body.style.overflow = oldOverflow;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [returnFocus]);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | undefined;
    setPrepared(null);
    setImageError(false);
    void renderRecordShareImage(snapshot).then(({ blob, fileName }) => {
      if (!alive) return;
      const file = new File([blob], fileName, { type: 'image/png' });
      objectUrl = URL.createObjectURL(blob);
      setPrepared({ file, url: objectUrl, native: canShareFile(file, text) });
    }).catch(() => { if (alive) setImageError(true); });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [snapshot, text, attempt]);

  // The file is ready before this click: awaiting its generation here would lose
  // transient user activation on some mobile browsers.
  const share = async () => {
    if (!prepared || sharing.current) return;
    sharing.current = true;
    setBusy(true);
    setStatus('');
    try {
      await navigator.share({ files: [prepared.file], text });
      if (mounted.current) setStatus('投稿状況はXで確認してください。');
    } catch (error) {
      if (mounted.current) setStatus(typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
        ? '共有をキャンセルしました。'
        : '共有を開けませんでした。画像を保存してXに添付できます。');
    } finally {
      sharing.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return createPortal(<div className="record-share-backdrop" onClick={(event) => {
    if (event.target === event.currentTarget) close.current();
  }}>
    <div ref={panel} className="record-share-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="record-share-heading"><h2 id={titleId}>記録を投稿</h2><button ref={closeButton} type="button" className="btn" onClick={() => close.current()}>閉じる</button></div>
      {prepared ? <img className="record-share-preview" src={prepared.url} alt={`${snapshot.day}の記録画像。今日と累計のテスト・確認・教材の学習回数。数値は下の投稿文でも確認できます。`} />
        : imageError ? <div role="alert" className="record-share-error"><p>記録画像を作成できませんでした。</p><button type="button" className="btn" onClick={() => setAttempt((value) => value + 1)}>もう一度作成</button></div>
          : <p role="status">記録画像を作成しています…</p>}
      <label className="record-share-text" htmlFor={textId}>投稿文<textarea id={textId} rows={4} readOnly value={text} /></label>
      {prepared && <>
        {prepared.native && <div className="record-share-native"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => { void share(); }}>画像と文面を共有</button><p>共有先でXを選んでください。</p></div>}
        <div className="record-share-fallback">
          <p>画像を保存し、Xの投稿画面で添付できます。</p>
          <div className="record-share-actions">
            <a className="btn" href={prepared.url} download={prepared.file.name}>1. 画像を保存</a>
            <a className="btn" href={xRecordComposeUrl(text)} target="_blank" rel="noopener noreferrer">2. Xの投稿画面を開く</a>
          </div>
          <p className="record-share-hint">画像は自動添付されません。投稿前に画像と文面をご確認ください。</p>
        </div>
      </>}
      <p role="status" className="record-share-status">{status}</p>
    </div>
  </div>, document.body);
}
