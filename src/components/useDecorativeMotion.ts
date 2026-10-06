import { useEffect } from 'react';

/** Pause decorative CSS timelines while the page is not being shown. */
export function useDecorativeMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.toggleAttribute('data-motion-paused', document.visibilityState !== 'visible');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      root.removeAttribute('data-motion-paused');
    };
  }, []);
}
