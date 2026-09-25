import { NavLink } from 'react-router-dom';

const items: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/', label: '作成', end: true },
  { to: '/library', label: '学習帳' },
  { to: '/test', label: 'テスト' },
  { to: '/records', label: '記録帳' },
  { to: '/settings', label: '設定' },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="メインナビ">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `bottom-nav__item${isActive ? ' is-active' : ''}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
