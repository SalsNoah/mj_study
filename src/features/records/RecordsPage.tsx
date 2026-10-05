import { useMemo, useState } from 'react';
import { useApp } from '@/app/store';
import { ViewTabs, viewPanelProps } from '@/components/ViewTabs';
import { badgeStatus, dailyTotals, dayKey, studyStreak } from '@/domain/records';
import { countMaterialStudies } from '@/domain/materials';
import { materialBadgeStatus } from '@/domain/materialRecords';
import { buildRecordSeries, RECORD_PERIODS, type RecordPeriod } from '@/domain/recordSeries';
import { RecordChart } from './RecordChart';
import { StudyTitleCard } from './StudyTitleCard';
import { MaterialStudyHistory } from './MaterialStudyHistory';
import './records.css';

export function RecordsPage() {
  const { store } = useApp();
  const [view, setView] = useState<RecordPeriod>('daily');
  const daily = store.daily;
  const totals = dailyTotals(daily);
  const status = badgeStatus(totals.total);
  const materialEvents = store.materialStudyEvents;
  const materialTotal = countMaterialStudies(materialEvents);
  const materialStatus = materialBadgeStatus(materialTotal);
  const streak = studyStreak(daily);
  const todayKey = dayKey();
  const today = daily?.[todayKey] ?? { tested: 0, confirmed: 0 };
  const series = useMemo(() => RECORD_PERIODS.map((period) => buildRecordSeries(daily, period.value, new Date(), materialEvents)), [daily, materialEvents, todayKey]);
  const activeDays = Object.values(daily ?? {}).filter((log) => log.tested + log.confirmed > 0).length;
  const number = (value: number) => value.toLocaleString('ja-JP');

  return (
    <div className="page page--records">
      <header className="page-header page-header--compact">
        <h1>記録帳</h1>
        <p className="count-pill">問題の連続学習 {streak} 日</p>
      </header>
      <section className="stat-grid" aria-label="問題の学習回数">
        <div className="stat"><span>今日のテスト</span><strong>{number(today.tested)}</strong></div>
        <div className="stat"><span>今日の確認</span><strong>{number(today.confirmed)}</strong></div>
        <div className="stat"><span>累計テスト</span><strong>{number(totals.tested)}</strong></div>
        <div className="stat"><span>累計確認</span><strong>{number(totals.confirmed)}</strong></div>
      </section>
      <div className="records-titles">
        <StudyTitleCard status={status} total={totals.total} label="問題学習の称号" totalLabel="問題の学習回数" definition="テストと確認の合計回数" />
        <StudyTitleCard status={materialStatus} total={materialTotal} label="教材学習の称号" totalLabel="教材の学習回数" definition="教材の「学習した」で残した記録の合計回数" />
      </div>
      <section className="panel records-history" aria-labelledby="records-history-title">
        <div className="records-history__heading"><h2 id="records-history-title">学習の推移</h2><p>問題を学習した日 <strong>{number(activeDays)}</strong> 日</p></div>
        <ViewTabs id="records-view" label="記録の表示" value={view} onChange={setView} tabs={RECORD_PERIODS} />
        {RECORD_PERIODS.map((period, index) => <div key={period.value} {...viewPanelProps('records-view', period.value, view)}>
          <RecordChart series={series[index]!} label={period.range} />
        </div>)}
      </section>
      <MaterialStudyHistory events={materialEvents} />
    </div>
  );
}
