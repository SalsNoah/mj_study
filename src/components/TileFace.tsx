import type { CSSProperties } from 'react';
import type { TileCode } from '@/domain/types';
import { tileLabel } from '@/domain/tiles';
import { tileImageUrl } from './tileImages';

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

const RATIO = 90 / 66;

/** 同梱の牌画像。横向きは yoko 画像を使う。 */
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
  const uprightW = size;
  const uprightH = size * RATIO;
  const w = rotated ? uprightH : uprightW;
  const h = rotated ? uprightW : uprightH;
  const label = tileLabel(code);

  const style: CSSProperties = {
    width: w,
    height: h,
    opacity: dimmed ? 0.45 : 1,
  };

  const cls = [
    onClick ? 'tile-btn' : 'tile-face',
    selected ? 'is-selected' : '',
    back ? 'is-back' : '',
    className,
  ].filter(Boolean).join(' ');

  const inner = back ? (
    <span className="tile-back" aria-hidden />
  ) : (
    <img src={tileImageUrl(code, rotated)} alt="" draggable={false} />
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        aria-label={label}
        aria-pressed={selected}
        onClick={onClick}
        tabIndex={tabIndex}
        style={style}
      >
        {inner}
      </button>
    );
  }

  return (
    <span className={cls} style={style} title={label} role="img" aria-label={label}>
      {inner}
    </span>
  );
}
