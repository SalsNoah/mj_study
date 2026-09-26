import { useRef, useState, type PointerEvent } from 'react';
import type { RelRect } from './profiles';

export type PickerRect = { key: string; label: string; color: string; rect: RelRect; active?: boolean };

type Props = {
  url: string;
  alt: string;
  rects: PickerRect[];
  /** 指でなぞって範囲を指定できるとき true（そのあいだ画像はスクロールしない） */
  drawing: boolean;
  zoom?: number;
  onRect: (rect: RelRect) => void;
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/** 画像の上を指でなぞって範囲を指定する。座標は画像サイズに対する割合で返す */
export function RectPicker({ url, alt, rects, drawing, zoom = 1, onRect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const relFrom = (e: PointerEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!drawing) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ポインターを捕まえられない環境でも、要素内でのドラッグはそのまま扱える
    }
    const p = relFrom(e);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const p = relFrom(e);
    setDrag({ ...drag, x1: p.x, y1: p.y });
  };
  const onUp = () => {
    if (!drag) return;
    const rect: RelRect = {
      x: Math.min(drag.x0, drag.x1),
      y: Math.min(drag.y0, drag.y1),
      w: Math.abs(drag.x1 - drag.x0),
      h: Math.abs(drag.y1 - drag.y0),
    };
    setDrag(null);
    if (rect.w >= 0.005 && rect.h >= 0.005) onRect(rect);
  };

  const box = (r: RelRect) => ({
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  });

  return (
    <div className="shot-scroll">
      <div
        ref={ref}
        className={`shot${drawing ? ' is-drawing' : ''}`}
        style={{ width: `${zoom * 100}%` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
      >
        <img src={url} alt={alt} draggable={false} />
        {rects.map((r) => (
          <div
            key={r.key}
            className={`shot-rect${r.active ? ' is-on' : ''}`}
            style={{ ...box(r.rect), borderColor: r.color }}
          >
            <span style={{ background: r.color }}>{r.label}</span>
          </div>
        ))}
        {drag && (
          <div
            className="shot-rect is-drag"
            style={box({
              x: Math.min(drag.x0, drag.x1),
              y: Math.min(drag.y0, drag.y1),
              w: Math.abs(drag.x1 - drag.x0),
              h: Math.abs(drag.y1 - drag.y0),
            })}
          />
        )}
      </div>
    </div>
  );
}
