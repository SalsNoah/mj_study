import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans-jp/400.css';
import '@fontsource/ibm-plex-sans-jp/600.css';
import App, { createAppRouter } from './app/App';
import { applyTheme, loadTheme } from './app/theme';

applyTheme(loadTheme());
const router = createAppRouter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App router={router} />
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
