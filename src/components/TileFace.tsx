import type { CSSProperties } from 'react';
import type { TileCode } from '@/domain/types';
import { isRed, tileLabel, tileRank, tileSuit } from '@/domain/tiles';

type Props = {
  code: TileCode;
  size?: number;
  selected?: boolean;
  dimmed?: boolean;
  rotated?: boolean;
  back?: boolean;
  onClick?: () => void;
  tabIndex?: number;
  className?: string;
};

/** 同梱SVG描画（外部画像非依存）。画面とPNGで共有。 */
export function TileFace({
  code,
  size = 44,
  selected = false,
  dimmed = false,
  rotated = false,
  back = false,
  onClick,
  tabIndex,
  className = '',
}: Props) {
  const w = size;
  const h = size * 1.32;
  const suit = tileSuit(code);
  const rank = tileRank(code);
  const red = isRed(code);
  const label = tileLabel(code);

  const body = back ? (
    <rect x="2" y="2" width={w - 4} height={h - 4} rx="4" fill="#1B4D3E" stroke="#0F2E24" strokeWidth="1.5" />
  ) : (
    <>
      <rect
        x="1.5"
        y="1.5"
        width={w - 3}
        height={h - 3}
        rx="4"
        fill={red ? '#FFF5F5' : '#FFFEFA'}
        stroke={selected ? '#1B4D3E' : '#C9C2B2'}
        strokeWidth={selected ? 2.5 : 1.2}
      />
      <TileGlyph suit={suit} rank={rank} red={red} w={w} h={h} />
    </>
  );

  const style: CSSProperties = {
    width: rotated ? h : w,
    height: rotated ? w : h,
    opacity: dimmed ? 0.45 : 1,
    transform: rotated ? 'rotate(-90deg)' : undefined,
    transformOrigin: 'center center',
  };

  if (onClick) {
    return (
      <button
        type="button"
        className={`tile-btn ${className}`}
        aria-label={label}
        aria-pressed={selected}
        onClick={onClick}
        tabIndex={tabIndex}
        style={style}
      >
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-hidden>
          {body}
        </svg>
      </button>
    );
  }

  return (
    <span className={`tile-face ${className}`} style={style} title={label}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        {body}
      </svg>
    </span>
  );
}

function TileGlyph({
  suit,
  rank,
  red,
  w,
  h,
}: {
  suit: string;
  rank: number;
  red: boolean;
  w: number;
  h: number;
}) {
  const color =
    suit === 'm' ? (red ? '#C62828' : '#C62828') :
    suit === 'p' ? (red ? '#C62828' : '#1565C0') :
    suit === 's' ? (red ? '#C62828' : '#2E7D32') :
    rank === 6 ? '#2E7D32' : rank === 7 ? '#C62828' : '#222';

  if (suit === 'z') {
    const marks = ['東', '南', '西', '北', '白', '發', '中'];
    const text = marks[rank - 1] ?? '?';
    if (rank === 5) {
      return (
        <rect x={w * 0.22} y={h * 0.22} width={w * 0.56} height={h * 0.56} fill="none" stroke="#999" strokeWidth="1.5" />
      );
    }
    return (
      <text
        x={w / 2}
        y={h / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={w * 0.42}
        fontFamily="serif"
        fontWeight="700"
        fill={color}
      >
        {text}
      </text>
    );
  }

  const suitMark = suit === 'm' ? '萬' : suit === 'p' ? '◎' : '║';
  return (
    <>
      <text
        x={w / 2}
        y={h * 0.38}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={w * 0.4}
        fontFamily="serif"
        fontWeight="700"
        fill={color}
      >
        {rank}
      </text>
      <text
        x={w / 2}
        y={h * 0.72}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={suit === 'm' ? w * 0.28 : w * 0.32}
        fontFamily="serif"
        fontWeight="700"
        fill={color}
      >
        {suitMark}
      </text>
      {red && (
        <circle cx={w * 0.78} cy={h * 0.18} r={w * 0.08} fill="#C62828" />
      )}
    </>
  );
}
