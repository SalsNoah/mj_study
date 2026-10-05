import type { RecordShareCounts, RecordShareSnapshot } from '@/domain/recordShare';

const FONT = '"IBM Plex Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';

/** Render only approved aggregate fields. No DOM screenshot or external images. */
export async function renderRecordShareImage(snapshot: RecordShareSnapshot): Promise<{ blob: Blob; fileName: string }> {
  if (document.fonts) {
    await Promise.all([document.fonts.load(`600 52px ${FONT}`), document.fonts.load(`400 36px ${FONT}`)]).catch(() => undefined);
    await document.fonts.ready;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Record image canvas is unavailable');

  ctx.fillStyle = '#f5f0e7';
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = '#e7dfd3';
  ctx.lineWidth = 1;
  for (let y = 32; y < 1080; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080, y); ctx.stroke(); }
  const text = (value: string, x: number, y: number, size: number, color: string, weight = 400, align: CanvasTextAlign = 'left', width = 900) => {
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    let fittedSize = size;
    ctx.font = `${weight} ${fittedSize}px ${FONT}`;
    while (ctx.measureText(value).width > width && fittedSize > 24) {
      fittedSize -= 1;
      ctx.font = `${weight} ${fittedSize}px ${FONT}`;
    }
    if (ctx.measureText(value).width > width) throw new Error('Record image text exceeds its safe width');
    ctx.fillText(value, x, y);
  };
  text('麻雀学習帳', 72, 110, 60, '#62452f', 600);
  text(`${snapshot.day.replaceAll('-', '/')} の学習記録`, 72, 173, 34, '#6f655a');
  const section = (label: string, counts: RecordShareCounts, top: number) => {
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(64, top, 952, 336);
    ctx.fillStyle = '#71503b';
    ctx.fillRect(64, top, 6, 336);
    text(label, 102, top + 57, 40, '#71503b', 600);
    const rows: [string, number][] = [['テスト', counts.tested], ['確認', counts.confirmed], ['教材学習', counts.materials]];
    rows.forEach(([name, count], index) => {
      const y = top + 130 + index * 76;
      text(name, 106, y, 36, '#625a51');
      text(count.toLocaleString('ja-JP'), 915, y, 52, '#3f3027', 600, 'right', 560);
      text('回', 936, y, 28, '#6f655a');
    });
  };
  section('今日', snapshot.today, 224);
  section('累計', snapshot.total, 600);
  text('#麻雀学習帳', 72, 1007, 36, '#71503b', 600);
  text('累計は表示期間より前の記録を含みます', 72, 1048, 26, '#6f655a');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Record image export failed')), 'image/png');
  });
  return { blob, fileName: `mahjong-study-records-${snapshot.day}.png` };
}
