import { useState } from 'react';
import { youtubeThumbnailUrl } from './materialList';

export function MaterialThumbnail({ url }: { url: string }) {
  const src = youtubeThumbnailUrl(url);
  return <ThumbnailImage key={src ?? url} src={src} />;
}

function ThumbnailImage({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="material-thumbnail" aria-hidden="true">
      {src && !failed ? <img src={src} alt="" loading="lazy" decoding="async"
        crossOrigin="anonymous" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : (
        <span className="material-thumbnail__placeholder">
          <svg viewBox="0 0 32 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="28" height="20" rx="3" />
            {src ? <path d="m13 7 8 5-8 5Z" fill="currentColor" stroke="none" /> : <path d="M9 8h14M9 12h14M9 16h9" />}
          </svg>
          <span>{src ? 'YouTube' : '教材'}</span>
        </span>
      )}
    </div>
  );
}
