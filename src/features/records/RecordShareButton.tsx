import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadTheme, THEMES, type ThemeId } from '@/app/theme';
import { createRecordShareSnapshot, recordShareText, type RecordShareSnapshot } from '@/domain/recordShare';
import type { DailyLog, MaterialStudyEvent } from '@/domain/types';
import { renderRecordShareImage } from './renderRecordShare';
import './recordShare.css';

export function RecordShareButton({ daily, events }: {
  daily: Record<string, DailyLog> | undefined;
  events: readonly MaterialStudyEvent[] | undefined;
}) {
  const [request, setRequest] = useState<{ snapshot: RecordShareSnapshot; theme: ThemeId } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} type="button" className="btn records-share-trigger" aria-haspopup="dialog"
      onClick={() => setRequest({
        snapshot: createRecordShareSnapshot(daily, events),
        theme: THEMES.find(({ id }) => id === document.documentElement.dataset.theme)?.id ?? loadTheme(),
      })}>Xに記録を投稿</button>
    {request && <RecordShareDialog {...request} returnFocus={trigger.current} onClose={() => setRequest(null)} />}
  </>;
}

export function xRecordComposeUrl(text: string): string {
  const url = new URL('https://twitter.com/intent/tweet');
  url.searchParams.set('text', text);
  return url.href;
}

type NativeShareMode = 'image-and-text' | 'image' | null;

function nativeShareMode(file: File, text: string): NativeShareMode {
  try {
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function'
      || !navigator.canShare({ files: [file] })) return null;
  } catch { return null; }
  // Keep image sharing available even when the combined payload is unsupported.
  try {
    if (navigator.canShare({ files: [file], text })) return 'image-and-text';
  } catch { /* The file-only payload was accepted above. */ }
  return 'image';
}

function RecordShareDialog({ snapshot, theme, returnFocus, onClose }: {
  snapshot: RecordShareSnapshot;
  theme: ThemeId;
  returnFocus: HTMLElement | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const textId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const textField = useRef<HTMLTextAreaElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const mounted = useRef(false);
  const sharing = useRef(false);
  const [prepared, setPrepared] = useState<{ file: File; url: string; native: NativeShareMode } | null>(null);
  const [imageError, setImageError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
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
        const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled]), summary')]
          .filter((control) => {
            const hiddenDetails = control.closest('details:not([open])');
            return !hiddenDetails || control === hiddenDetails.querySelector('summary');
          });
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
    void renderRecordShareImage(snapshot, theme).then(({ blob, fileName }) => {
      if (!alive) return;
      const file = new File([blob], fileName, { type: 'image/png' });
      objectUrl = URL.createObjectURL(blob);
      const native = nativeShareMode(file, text);
      setPrepared({ file, url: objectUrl, native });
      setFallbackOpen(!native);
    }).catch(() => { if (alive) setImageError(true); });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [snapshot, theme, text, attempt]);

  const copyText = async () => {
    setCopyStatus('');
    try {
      await navigator.clipboard.writeText(text);
      if (mounted.current) setCopyStatus('投稿文をコピーしました。Xの投稿欄に貼り付けられます。');
    } catch {
      if (!mounted.current) return;
      textField.current?.focus();
      textField.current?.select();
      setCopyStatus('投稿文を選択しました。端末のコピー操作でコピーしてください。');
    }
  };

  // The file is ready before this click: awaiting its generation here would lose
  // transient user activation on some mobile browsers.
  const share = async () => {
    if (!prepared?.native || sharing.current) return;
    sharing.current = true;
    setBusy(true);
    setStatus('');
    try {
      await navigator.share(prepared.native === 'image-and-text' ? { files: [prepared.file], text } : { files: [prepared.file] });
      if (mounted.current) setStatus(prepared.native === 'image-and-text'
        ? '共有先で画像と文面をご確認ください。投稿は共有先で行います。'
        : '共有先で画像をご確認ください。投稿文はコピーして貼り付けられます。');
    } catch (error) {
      if (mounted.current) {
        const aborted = typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
        setStatus(aborted ? '共有を中断しました。共有先が見つからない場合は、下の保存手順を使えます。'
          : '共有を開けませんでした。下の保存手順でXに添付できます。');
        if (!aborted) setFallbackOpen(true);
      }
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
      <label className="record-share-text" htmlFor={textId}>投稿文<textarea ref={textField} id={textId} rows={4} readOnly value={text} /></label>
      <div className="record-share-copy"><button type="button" className="btn" disabled={busy} onClick={() => { void copyText(); }}>投稿文をコピー</button><p role="status">{copyStatus}</p></div>
      {prepared && <>
        {prepared.native && <div className="record-share-native">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { void share(); }}>{prepared.native === 'image-and-text' ? '画像付きで共有' : '画像を共有'}</button>
          <p>共有先でXを選んでください。画像は保存せずに共有先へ渡せます。</p>
          <p>{prepared.native === 'image-and-text' ? '画像と文面の受け取り方は端末やアプリによります。投稿前にご確認ください。' : 'この端末では画像だけを共有します。投稿文はコピーしてXに貼り付けてください。'}</p>
        </div>}
        <details className="record-share-fallback" open={fallbackOpen} onToggle={(event) => setFallbackOpen(event.currentTarget.open)}>
          <summary>{prepared.native ? '画像が添付されない・Xが見つからないとき' : '画像を保存してXに添付'}</summary>
          {!prepared.native && <p>このブラウザでは画像を直接共有できません。下の手順で投稿できます。</p>}
          <p>画像を保存し、Xの投稿画面で添付できます。</p>
          <div className="record-share-actions">
            <a className="btn" href={prepared.url} download={prepared.file.name}>1. 画像を保存</a>
            <a className="btn" href={xRecordComposeUrl(text)} target="_blank" rel="noopener noreferrer">2. Xの投稿画面を開く</a>
          </div>
          <p className="record-share-hint">この保存手順では画像は自動添付されません。Xで保存した画像を選んでください。</p>
        </details>
      </>}
      <p role="status" className="record-share-status">{status}</p>
    </div>
  </div>, document.body);
}
