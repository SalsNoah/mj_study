import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans-jp/400.css';
import '@fontsource/ibm-plex-sans-jp/600.css';
import App from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', new URL(import.meta.env.BASE_URL, window.location.href));
    navigator.serviceWorker.register(swUrl).catch(() => {
      /* オフラインキャッシュが使えなくても学習帳自体は localStorage で動く */
    });
  });
}
