import { normalizeMaterialUrl } from '@/domain/materials';
import { recentMaterialStudyEvents } from '@/domain/materialRecords';
import type { MaterialStudyEvent } from '@/domain/types';

const LATEST_COUNT = 3;
const dateFormat = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

function MaterialStudyEntry({ event }: { event: MaterialStudyEvent }) {
  const date = new Date(event.at);
  const validDate = Number.isFinite(date.getTime());
  const link = normalizeMaterialUrl(event.url);
  return <li className="records-material-history__entry">
    <time dateTime={validDate ? event.at : undefined}>{validDate ? dateFormat.format(date) : '日時不明'}</time>
    <h3>{event.title}</h3>
    {event.comment && <p className="records-material-history__comment">{event.comment}</p>}
    {link.ok && <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${event.title}を開く（新しいタブ）`}>教材を開く <span aria-hidden="true">↗</span></a>}
  </li>;
}

export function MaterialStudyHistory({ events }: { events: readonly MaterialStudyEvent[] | undefined }) {
  const history = recentMaterialStudyEvents(events);
  const recent = history.slice(0, LATEST_COUNT);
  const older = history.slice(LATEST_COUNT);
  return <section className="panel records-material-history" aria-labelledby="records-material-history-title">
    <div className="records-history__heading"><h2 id="records-material-history-title">教材の学習履歴</h2><p>{history.length.toLocaleString('ja-JP')} 回</p></div>
    {history.length === 0 ? <p className="records-material-history__empty">教材の「学習した」で記録すると、ここに残ります</p> : <>
      <ol className="records-material-history__list">{recent.map((event) => <MaterialStudyEntry key={event.id} event={event} />)}</ol>
      {older.length > 0 && <details className="records-material-history__older">
        <summary>過去の記録を見る（{older.length.toLocaleString('ja-JP')}件）</summary>
        <ol className="records-material-history__list" start={LATEST_COUNT + 1}>{older.map((event) => <MaterialStudyEntry key={event.id} event={event} />)}</ol>
      </details>}
    </>}
  </section>;
}
