type Tier = {
  light: string;
  dark: string;
  shape: 'circle' | 'shield' | 'hexagon' | 'star';
};

/** 3段階ごとに形と色が上がる：銅の円 → 銀の盾 → 金の六角 → 翠の星 */
const TIERS: Tier[] = [
  { light: '#e7b184', dark: '#8b4a1f', shape: 'circle' },
  { light: '#eef2f6', dark: '#6f7c8a', shape: 'shield' },
  { light: '#ffe28a', dark: '#b07d0c', shape: 'hexagon' },
  { light: '#8ff0d8', dark: '#1b4d3e', shape: 'star' },
];

function starPath(points: number, outer: number, inner: number): string {
  const d: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    d.push(`${(32 + r * Math.cos(a)).toFixed(2)} ${(32 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${d.join(' L')} Z`;
}

const SHAPES: Record<Tier['shape'], string> = {
  circle: 'M32 4 A28 28 0 1 1 31.99 4 Z',
  shield: 'M32 4 L56 12 V30 C56 46 45 56 32 61 C19 56 8 46 8 30 V12 Z',
  hexagon: 'M32 3 L57 17.5 V46.5 L32 61 L7 46.5 V17.5 Z',
  star: starPath(8, 30, 23),
};

type Props = {
  level: number;
  locked?: boolean;
  size?: number;
};

export function BadgeIcon({ level, locked = false, size = 48 }: Props) {
  const tierIndex = Math.min(TIERS.length - 1, Math.floor(level / 3));
  const colors = TIERS[tierIndex]!;
  const bars = (level % 3) + 1;
  const gradId = `badge-g-${level}`;
  const path = SHAPES[colors.shape];
  const barYs = bars === 1 ? [32] : bars === 2 ? [27, 37] : [22, 32, 42];

  return (
    <svg
      className={`badge-icon${locked ? ' is-locked' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors.light} />
          <stop offset="1" stopColor={colors.dark} />
        </linearGradient>
      </defs>
      <path d={path} fill={`url(#${gradId})`} />
      <path
        d={path}
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2.5"
        transform="translate(32 32) scale(0.8) translate(-32 -32)"
      />
      {barYs.map((y) => (
        <polyline
          key={y}
          points={`21,${y - 4} 32,${y + 3} 43,${y - 4}`}
          fill="none"
          stroke="#fff"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
