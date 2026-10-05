import { useId } from 'react';
import { recordDateLabel, type RecordSeries } from '@/domain/recordSeries';

const WIDTH = 560;
const HEIGHT = 160;

function chartCeiling(max: number): number {
  if (max <= 4) return 4;
  const roughStep = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 5, 10].find((value) => value * magnitude >= roughStep)! * magnitude;
  return step * 4;
}

export function RecordChart({ series, label }: { series: RecordSeries; label: string }) {
  const id = useId();
  const { points } = series;
  const { tested, confirmed, materials } = points.at(-1)!.cumulative;
  const ceiling = chartCeiling(Math.max(tested, confirmed, materials));
  const x = (index: number) => index * WIDTH / (points.length - 1);
  const y = (value: number) => HEIGHT - value * HEIGHT / ceiling;
  const line = (field: 'tested' | 'confirmed' | 'materials') => points.map((point, index) => `${x(index)},${y(point.cumulative[field])}`).join(' ');
  const ticks = [0, Math.round((points.length - 1) / 2), points.length - 1];
  const currentNote = '表示期間より前を含む累計・最新は今日まで'
    + (series.period === 'weekly' ? '（月曜始まり）' : '');
  const endpoint = series.period === 'weekly' ? '各週末' : series.period === 'monthly' ? '各月末' : '各日末';

  return <>
    <div className="records-period-heading">
      <h3>{label}</h3>
      <p>{recordDateLabel(series.start)}〜{recordDateLabel(series.end)}</p>
    </div>
    <div className="records-series-totals" aria-label="今日までの累計">
      <p><span className="records-line-key records-line-key--tested" aria-hidden="true" /><span>テスト累計</span><strong>{tested.toLocaleString('ja-JP')}</strong><span>回</span></p>
      <p><span className="records-line-key records-line-key--confirmed" aria-hidden="true" /><span>確認累計</span><strong>{confirmed.toLocaleString('ja-JP')}</strong><span>回</span></p>
      <p><span className="records-line-key records-line-key--materials" aria-hidden="true" /><span>教材累計</span><strong>{materials.toLocaleString('ja-JP')}</strong><span>回</span></p>
    </div>
    <figure className="records-chart" aria-labelledby={`${id}-caption`}>
      <figcaption id={`${id}-caption`} className="records-chart__caption">{currentNote}</figcaption>
      <div className="records-chart__canvas" role="img" aria-label={`${label}の累計学習回数。今日までの累計はテスト${tested}回、確認${confirmed}回、教材${materials}回。${endpoint}時点（最後は今日まで）の累計は下の一覧で確認できます。`}>
        <div className="records-chart__unit" aria-hidden="true">累計（回）</div>
        <div className="records-chart__y-axis" style={{ width: `${ceiling.toLocaleString('ja-JP').length + 0.5}ch` }} aria-hidden="true">
          {[4, 3, 2, 1, 0].map((tick) => <span key={tick} style={{ top: `${100 - tick * 25}%` }}>{(ceiling * tick / 4).toLocaleString('ja-JP')}</span>)}
        </div>
        <div className="records-chart__plot" aria-hidden="true">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" focusable="false">
            {[0, 1, 2, 3, 4].map((tick) => <line key={tick} x1="0" x2={WIDTH} y1={tick * HEIGHT / 4} y2={tick * HEIGHT / 4} className="records-chart__grid" vectorEffect="non-scaling-stroke" />)}
            <polyline points={line('tested')} className="records-chart__line records-chart__line--tested" vectorEffect="non-scaling-stroke" />
            <polyline points={line('confirmed')} className="records-chart__line records-chart__line--confirmed" vectorEffect="non-scaling-stroke" />
            <polyline points={line('materials')} className="records-chart__line records-chart__line--materials" vectorEffect="non-scaling-stroke" />
          </svg>
          {(['tested', 'confirmed', 'materials'] as const).flatMap((field) => points.map((point, index) => <span key={`${field}-${point.key}`}
            className={`records-chart__point records-chart__point--${field}`} style={{ left: `${index * 100 / (points.length - 1)}%`, top: `${100 - point.cumulative[field] * 100 / ceiling}%` }} />))}
        </div>
        <div className="records-chart__x-axis" aria-hidden="true">
          {ticks.map((index, tick) => <span key={index} style={{ left: `${index * 100 / (points.length - 1)}%` }}
            className={tick === 0 ? 'is-first' : tick === ticks.length - 1 ? 'is-last' : ''}>{points[index]!.axisLabel}</span>)}
        </div>
      </div>
    </figure>
    {tested + confirmed + materials === 0 && <p className="records-empty">学習記録はまだありません</p>}
    <details className="records-values">
      <summary>累計を一覧で見る</summary>
      <table>
        <caption>{endpoint}時点の累計回数（最後は今日まで・古い順）</caption>
        <thead><tr><th scope="col">{series.period === 'daily' ? '日付' : '期間'}</th><th scope="col">テスト累計</th><th scope="col">確認累計</th><th scope="col">教材累計</th></tr></thead>
        <tbody>{points.map((point, index) => <tr key={point.key} className={index === points.length - 1 ? 'is-current' : ''}>
          <th scope="row">{point.label}</th><td>{point.cumulative.tested.toLocaleString('ja-JP')}</td><td>{point.cumulative.confirmed.toLocaleString('ja-JP')}</td><td>{point.cumulative.materials.toLocaleString('ja-JP')}</td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">今日までの累計</th><td>{tested.toLocaleString('ja-JP')}</td><td>{confirmed.toLocaleString('ja-JP')}</td><td>{materials.toLocaleString('ja-JP')}</td></tr></tfoot>
      </table>
    </details>
  </>;
}
