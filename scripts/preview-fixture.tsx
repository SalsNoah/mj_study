// Isolated display fixture only. Does not assert that the app's public #share router works.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../src/app/store';
import { ShareReceivePage } from '../src/features/share/ShareReceivePage';
import '@fontsource/ibm-plex-sans-jp/400.css';
import '@fontsource/ibm-plex-sans-jp/600.css';
import '../src/app/styles.css';
const encoded = decodeURIComponent(window.location.hash.slice('#share='.length));
createRoot(document.getElementById('root')!).render(
  <AppProvider><MemoryRouter><div className="app-shell"><ShareReceivePage encoded={encoded} /></div></MemoryRouter></AppProvider>,
);
