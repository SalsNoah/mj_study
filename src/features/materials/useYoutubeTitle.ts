import { useEffect, useRef, useState } from 'react';
import { MATERIAL_LIMITS } from '@/domain/materials';
import { youtubeVideoId } from './youtube';

/** New-material draft only. Refs invalidate work immediately, before effects clean up. */
export function useYoutubeTitle(active: boolean) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('');
  const manual = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const cancel = () => {
    setStatus('');
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
  };
  const changeUrl = (value: string) => {
    cancel();
    setUrl(value);
    setStatus('');
    if (!manual.current) setTitle('');
  };
  const changeTitle = (value: string) => {
    cancel();
    // Even deleting a title is an intentional edit; do not refill it behind the user.
    manual.current = true;
    setTitle(value);
    setStatus('');
  };
  useEffect(() => {
    const id = youtubeVideoId(url);
    if (!active || manual.current || !id) return;
    const token = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const current = () => generation.current === token && !abort.signal.aborted;
    const timer = setTimeout(async () => {
      if (!current()) return;
      setStatus('YouTubeのタイトルを取得中…（そのまま登録もできます）');
      timeout = setTimeout(() => {
        if (!current()) return;
        setStatus('タイトルを取得できませんでした。手入力、または空欄のまま登録できます。');
        abort.abort();
      }, 5000);
      try {
        const endpoint = new URL('https://www.youtube.com/oembed');
        endpoint.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`);
        endpoint.searchParams.set('format', 'json');
        const response = await fetch(endpoint.href, { signal: abort.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
        if (!response.ok) throw new Error('oEmbed unavailable');
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('title' in data) || typeof data.title !== 'string' || !data.title.trim()) throw new Error('Missing title');
        if (!current()) return;
        const value = data.title.trim();
        // Match the existing UTF-16 limit without leaving half of a surrogate pair.
        const shortened = value.slice(0, MATERIAL_LIMITS.title).replace(/[\uD800-\uDBFF]$/, '');
        setTitle(shortened);
        setStatus(value.length > MATERIAL_LIMITS.title
          ? '長いタイトルを100文字以内に短縮しました。編集できます。'
          : 'YouTubeのタイトルを補完しました。編集できます。');
      } catch {
        if (current()) setStatus('タイトルを取得できませんでした。手入力、または空欄のまま登録できます。');
      } finally {
        clearTimeout(timeout);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      clearTimeout(timeout);
      abort.abort();
      generation.current += 1;
    };
  }, [url, active]);
  return { url, title, status, changeUrl, changeTitle, cancel };
}
