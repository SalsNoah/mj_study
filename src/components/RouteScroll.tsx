import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** New screens start at the top; browser Back restores the previous list position. */
export function RouteScroll() {
  const { key } = useLocation();
  const navigation = useNavigationType();
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    window.scrollTo({ top: navigation === 'POP' ? positions.current.get(key) ?? 0 : 0, behavior: 'instant' });
    return () => { positions.current.set(key, window.scrollY); };
  }, [key, navigation]);
  return null;
}
