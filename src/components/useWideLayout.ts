import { useSyncExternalStore } from 'react';
const query = '(min-width: 1100px)';
const snapshot = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
const subscribe = (notify: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(query);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
export function useWideLayout() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
