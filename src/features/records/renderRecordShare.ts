import type { RecordShareCounts, RecordShareSnapshot } from '@/domain/recordShare';
import type { ThemeId } from '@/app/theme';

const FONT = '"IBM Plex Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
const ROUND_FONT = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif';
const MOE_FONT = '"Mochiy Pop One", "Zen Maru Gothic", sans-serif';
// Fontsource splits Japanese glyphs into unicode ranges. Loading the default
// space alone would leave the card's Japanese text in a fallback font.
const FONT_TEXT = '麻雀学習帳今日累計テスト確認教材回の記録は表示期間より前を含みます0123456789,/#-';

type ImageStyle = { background: string; paper: string; ink: string; muted: string; accent: string; line: string; radius: number; round?: boolean; art?: [string, string]; veil?: string; cardVeil?: string };
const STYLES: Record<ThemeId, ImageStyle> = {
  normal: { background:'#f3eee3', paper:'#fffcf6', ink:'#1a2420', muted:'#5c6b63', accent:'#1b4d3e', line:'#d5cbb8', radius:14 },
  cool: { background:'#0b1118', paper:'#131c27', ink:'#e3eaf2', muted:'#b2b8bf', accent:'#4cc9f0', line:'#3b5468', radius:6, art:['cool/background.webp','cool/card.webp'], veil:'rgba(11,17,24,.58)', cardVeil:'rgba(19,28,39,.88)' },
  cute: { background:'#fff6f9', paper:'#ffffff', ink:'#4b3a47', muted:'#85677f', accent:'#cf3f79', line:'#f0cfe0', radius:24, round:true, art:['cute/background.webp','cute/card.webp'], veil:'rgba(255,246,249,.28)', cardVeil:'rgba(255,255,255,.65)' },
  dopa: { background:'#090b18', paper:'#101428', ink:'#f4f3ff', muted:'#bcb8d5', accent:'#82eaff', line:'#c8a0ff', radius:12, art:['dopa/neon-trails-background.jpg','dopa/neon-wave-card.jpg'], veil:'rgba(7,9,24,.64)', cardVeil:'rgba(16,20,40,.88)' },
  moe: { background:'#fff1f6', paper:'#fffcfa', ink:'#59283f', muted:'#785369', accent:'#ad285f', line:'#deb0c1', radius:30, round:true, art:['moe/background.webp','moe/card.webp'], veil:'rgba(255,249,250,.18)', cardVeil:'rgba(255,252,250,.62)' },
};

/** Only packaged theme artwork can enter the canvas; failed images keep the theme palette. */
function loadThemeArt(path: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true; clearTimeout(timer); image.onload = null; image.onerror = null; resolve(value);
    };
    const timer = setTimeout(() => finish(null), 5000);
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null);
    image.onerror = () => finish(null);
    image.src = new URL(`themes/${path}`, new URL(import.meta.env.BASE_URL, window.location.href)).href;
  });
}

/** Render approved aggregate fields and the chosen theme's bundled decoration only. */
export async function renderRecordShareImage(snapshot: RecordShareSnapshot, theme: ThemeId = 'normal'): Promise<{ blob: Blob; fileName: string }> {
  const style = Object.prototype.hasOwnProperty.call(STYLES, theme) ? STYLES[theme] : STYLES.normal;
  const font = style === STYLES.moe ? MOE_FONT : style.round ? ROUND_FONT : FONT;
  const strong = style === STYLES.moe ? 400 : style.round ? 700 : 600;
  const artwork = style.art ? Promise.all(style.art.map(loadThemeArt)) : Promise.resolve([null, null]);
  if (document.fonts) {
    if (style === STYLES.moe) await import('@/app/moeFont').catch(() => undefined);
    else if (style.round) await import('@/app/cuteFont').catch(() => undefined);
    await Promise.all([document.fonts.load(`${strong} 52px ${font}`, FONT_TEXT), document.fonts.load(`400 36px ${font}`, FONT_TEXT)]).catch(() => undefined);
    if (style === STYLES.moe) await document.fonts.load(`400 36px ${ROUND_FONT}`, FONT_TEXT).catch(() => undefined);
    await document.fonts.ready;
  }
  const [backgroundArt, cardArt] = await artwork;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Record image canvas is unavailable');

  const cover = (image: HTMLImageElement, x: number, y: number, width: number, height: number) => {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const sourceWidth = width / scale, sourceHeight = height / scale;
    ctx.drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
  };
  const roundedPath = (x: number, y: number, width: number, height: number, radius: number) => {
    ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius); ctx.arcTo(x, y + height, x, y, radius); ctx.arcTo(x, y, x + width, y, radius); ctx.closePath();
  };
  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, 1080, 1080);
  if (backgroundArt) { cover(backgroundArt, 0, 0, 1080, 1080); ctx.fillStyle = style.veil!; ctx.fillRect(0, 0, 1080, 1080); }
  if (style === STYLES.normal) {
    ctx.strokeStyle = '#e4ddcf'; ctx.lineWidth = 1;
    for (let y = 32; y < 1080; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080, y); ctx.stroke(); }
  }
  let border: string | CanvasGradient = style.line;
  if (style === STYLES.dopa) {
    border = ctx.createLinearGradient(64, 224, 1016, 936);
    ['#ff68b7','#b59aff','#67e8ff','#94f3b3','#ffe585','#ffab7c'].forEach((color, index) => (border as CanvasGradient).addColorStop(index / 5, color));
  }
  const text = (value: string, x: number, y: number, size: number, color: string, weight = 400, align: CanvasTextAlign = 'left', width = 900) => {
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    const readable = style === STYLES.moe && (size < 32 || /^[\d,]+$/.test(value));
    const textFont = readable ? ROUND_FONT : font;
    let fittedSize = size;
    ctx.font = `${weight} ${fittedSize}px ${textFont}`;
    while (ctx.measureText(value).width > width && fittedSize > 24) {
      fittedSize -= 1;
      ctx.font = `${weight} ${fittedSize}px ${textFont}`;
    }
    if (ctx.measureText(value).width > width) throw new Error('Record image text exceeds its safe width');
    ctx.fillText(value, x, y);
  };
  // Local backings preserve text contrast when artwork is bright.
  ctx.globalAlpha = .94; ctx.fillStyle = style.paper; roundedPath(56, 38, 840, 150, style.radius); ctx.fill();
  roundedPath(56, 952, 968, 112, style.radius); ctx.fill(); ctx.globalAlpha = 1;
  text('麻雀学習帳', 72, 110, 60, style.accent, strong);
  text(`${snapshot.day.replaceAll('-', '/')} の学習記録`, 72, 173, 34, style.muted);
  const section = (label: string, counts: RecordShareCounts, top: number) => {
    roundedPath(64, top, 952, 336, style.radius); ctx.fillStyle = style.paper; ctx.fill();
    if (cardArt) { ctx.save(); ctx.clip(); cover(cardArt,64,top,952,336); ctx.fillStyle=style.cardVeil!; ctx.fillRect(64,top,952,336); ctx.restore(); }
    roundedPath(64, top, 952, 336, style.radius); ctx.strokeStyle = border; ctx.lineWidth = style === STYLES.dopa ? 4 : 2; ctx.stroke();
    text(label, 102, top + 57, 40, style.accent, strong);
    const rows: [string, number][] = [['テスト', counts.tested], ['確認', counts.confirmed], ['教材学習', counts.materials]];
    rows.forEach(([name, count], index) => {
      const y = top + 130 + index * 76;
      text(name, 106, y, 36, style.muted);
      text(count.toLocaleString('ja-JP'), 915, y, 52, style.ink, strong, 'right', 560);
      text('回', 936, y, 28, style.muted);
    });
  };
  section('今日', snapshot.today, 224);
  section('累計', snapshot.total, 600);
  if (style === STYLES.moe) {
    const heart = (x: number, y: number, scale: number) => {
      ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale); ctx.beginPath(); ctx.moveTo(0,8); ctx.bezierCurveTo(-24,-10,-28,15,0,34); ctx.bezierCurveTo(28,15,24,-10,0,8);
      ctx.fillStyle='#f7b4cf'; ctx.strokeStyle='#cd6995'; ctx.lineWidth=1.5; ctx.fill(); ctx.stroke(); ctx.restore();
    };
    heart(952,60,1.6); heart(1004,111,.8); heart(966,253,.8); heart(966,629,.8);
  }
  text('#麻雀学習帳', 72, 1007, 36, style.accent, strong);
  text('累計は表示期間より前の記録を含みます', 72, 1048, 26, style.muted);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Record image export failed')), 'image/png');
  });
  return { blob, fileName: `mahjong-study-records-${snapshot.day}.png` };
}
