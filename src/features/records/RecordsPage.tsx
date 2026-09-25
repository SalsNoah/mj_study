import { useMemo } from 'react';
import { useApp } from '@/app/store';
import { tileImageUrl } from '@/components/tileImages';
import {
  BADGES,
  badgeStatus,
  dailyTotals,
  dayKey,
  studyStreak,
  type Badge,
} from '@/domain/records';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const DAYS_SHOWN = 14;

function BadgeMedal({ badge, locked = false, large = false }: { badge: Badge; locked?: boolean; large?: boolean }) {
  return (
    <span className={`medal${locked ? ' is-locked' : ''}${large ? ' medal--large' : ''}`} aria-hidden>
      <img src={tileImageUrl(badge.tile)} alt="" draggable={false} />
    </span>
  );
}

export function RecordsPage() {
  const { store } = useApp();
  const daily = store.daily ?? {};
  const totals = dailyTotals(daily);
  const status = badgeStatus(totals.total);
  const streak = studyStreak(daily);
  const todayKey = dayKey();
  const today = daily[todayKey] ?? { tested: 0, confirmed: 0 };

  const days = useMemo(() => {
    const list: Array<{ key: string; label: string; tested: number; confirmed: number }> = [];
    const d = new Date();
    for (let i = 0; i < DAYS_SHOWN; i++) {
      const key = dayKey(d);
      const log = daily[key] ?? { tested: 0, confirmed: 0 };
      list.push({
        key,
        label: `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`,
        tested: log.tested,
        confirmed: log.confirmed,
      });
      d.setDate(d.getDate() - 1);
    }
    return list;
  }, [daily]);

  const maxDay = Math.max(1, ...days.map((d) => d.tested + d.confirmed));
  const activeDays = Object.values(daily).filter((l) => l.tested + l.confirmed > 0).length;

  return (
    <div className="page page--records">
      <header className="page-header page-header--compact">
        <h1>記録帳</h1>
        <p className="count-pill">連続 {streak} 日</p>
      </header>

      <section className="panel status-card">
        <BadgeMedal badge={status.current} large />
        <div className="status-card__body">
          <p className="status-card__label">現在の称号</p>
          <p className="status-card__name">{status.current.name}</p>
          <p className="status-card__total">累計学習量 {totals.total}</p>
          {status.next ? (
            <>
              <div className="progress progress--thick" aria-hidden>
                <span style={{ width: `${status.progress * 100}%` }} />
              </div>
              <p className="hint">
                次の称号「{status.next.name}」まであと {status.remaining}
              </p>
            </>
          ) : (
            <p className="hint">最高の称号に到達しました</p>
          )}
        </div>
      </section>

      <section className="stat-grid">
        <div className="stat">
          <span>今日のテスト</span>
          <strong>{today.tested}</strong>
        </div>
        <div className="stat">
          <span>今日の確認</span>
          <strong>{today.confirmed}</strong>
        </div>
        <div className="stat">
          <span>累計テスト</span>
          <strong>{totals.tested}</strong>
        </div>
        <div className="stat">
          <span>累計確認</span>
          <strong>{totals.confirmed}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="daily-head">
          <h2 className="mini-title">日別（直近{DAYS_SHOWN}日）</h2>
          <span className="legend">
            <i className="legend__tested" />
            テスト
            <i className="legend__confirmed" />
            確認
          </span>
        </div>
        <ul className="daily-list">
          {days.map((d) => (
            <li key={d.key} className={d.key === todayKey ? 'is-today' : ''}>
              <span className="daily-list__date">{d.label}</span>
              <span className="daily-bar" aria-hidden>
                <span className="daily-bar__tested" style={{ width: `${(d.tested / maxDay) * 100}%` }} />
                <span className="daily-bar__confirmed" style={{ width: `${(d.confirmed / maxDay) * 100}%` }} />
              </span>
              <span className="daily-list__nums">
                {d.tested} / {d.confirmed}
              </span>
            </li>
          ))}
        </ul>
        <p className="hint">学習した日：累計 {activeDays} 日</p>
      </section>

      <section className="panel">
        <h2 className="mini-title">称号バッジ</h2>
        <ul className="badge-grid">
          {BADGES.map((b) => {
            const got = totals.total >= b.need;
            return (
              <li key={b.id} className={got ? 'is-got' : ''}>
                <BadgeMedal badge={b} locked={!got} />
                <span className="badge-grid__name">{b.name}</span>
                <span className="badge-grid__need">{b.need === 0 ? 'はじめから' : `累計${b.need}`}</span>
              </li>
            );
          })}
        </ul>
        <p className="hint">累計学習量 = テストで解いた問題数 + 学習帳で「確認した」を押した数</p>
      </section>
    </div>
  );
}
