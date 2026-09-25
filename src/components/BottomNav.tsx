import { NavLink } from 'react-router-dom';

const items: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/', label: '学習帳', end: true },
  { to: '/new', label: '作成' },
  { to: '/review', label: '復習' },
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
