import { useId } from 'react';
import { BadgeIcon } from '@/components/BadgeIcon';
import type { BadgeStatus } from '@/domain/records';

export function StudyTitleCard({ status, total, label = '現在の称号', definition = '学習量はテストと確認の合計回数', totalLabel = '累計学習量' }: {
  status: BadgeStatus; total: number; label?: string; definition?: string; totalLabel?: string;
}) {
  const titleId = useId();
  const number = (value: number) => value.toLocaleString('ja-JP');
  return <section className="panel records-title" aria-labelledby={titleId}>
    <div className="records-title__identity">
      <BadgeIcon level={status.current.level} size={68} />
      <div><p className="records-title__eyebrow">{label}</p><h2 id={titleId}>{status.current.name}</h2></div>
    </div>
    <p className="records-title__total"><span>{totalLabel}</span><strong>{number(total)}<small>回</small></strong></p>
    <div className="records-title__progress">
      {status.next ? <>
        <div className="records-title__next"><p>次の称号 <span>{status.next.name}</span></p><p>あと <strong>{number(status.remaining)}</strong> 回</p></div>
        <div className="records-title__track" role="progressbar" aria-label={`次の称号「${status.next.name}」までの進捗`}
          aria-valuemin={status.current.need} aria-valuemax={status.next.need} aria-valuenow={total}
          aria-valuetext={`累計${total}回。あと${status.remaining}回で${status.next.name}`}>
          <span style={{ width: `${status.progress * 100}%` }} />
        </div>
      </> : <p className="records-title__complete">すべての称号に到達しました</p>}
      <p className="records-title__definition">{definition}</p>
    </div>
  </section>;
}
