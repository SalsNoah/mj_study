const INKS = ['#8b715b', '#617663', '#a17a38', '#674d3d'];

type Props = { level: number; locked?: boolean; size?: number };

/** A tile-shaped seal; stems mark progress within each three-level ink tier. */
export function BadgeIcon({ level, locked = false, size = 48 }: Props) {
  const safeLevel = Math.max(0, Math.min(11, Math.floor(level)));
  const tier = Math.floor(safeLevel / 3);
  const stems = (safeLevel % 3) + 1;
  const ink = INKS[tier]!;
  const positions = stems === 1 ? [32] : stems === 2 ? [26, 38] : [20, 32, 44];

  return (
    <svg className={`badge-icon${locked ? ' is-locked' : ''}`} width={size} height={size}
      viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="11" y="7" width="44" height="53" rx="11" fill={ink} opacity="0.16" />
      <rect x="9" y="4" width="44" height="53" rx="11" fill="#fffcf6" stroke={ink} strokeWidth="1.5" />
      <rect x="14" y="9" width="34" height="43" rx="7" fill="none" stroke={ink} strokeWidth="0.8" opacity="0.4" />
      {positions.map((x) => <g key={x} stroke={ink} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d={`M${x} 22 V40 M${x - 3} 29 H${x + 3} M${x - 3} 36 H${x + 3}`} strokeWidth="2.2" />
        <path d={`M${x} 26 Q${x - 7} 26 ${x - 5} 21 Q${x} 21 ${x} 26 M${x} 33 Q${x + 7} 33 ${x + 5} 28 Q${x} 28 ${x} 33`} fill={ink} strokeWidth="0.8" />
      </g>)}
      {Array.from({ length: tier + 1 }, (_, index) => <circle key={index}
        cx={31 - tier * 3 + index * 6} cy="46" r="1.5" fill={ink} />)}
    </svg>
  );
}
