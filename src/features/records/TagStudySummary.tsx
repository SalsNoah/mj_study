import { useMemo } from 'react';
import { buildTagRecords } from '@/domain/tagRecords';
import type { Store } from '@/domain/types';

export function TagStudySummary({ store }: { store: Pick<Store, 'problems' | 'tags' | 'study' | 'attempts'> }) {
  const rows = useMemo(() => buildTagRecords(store), [store.problems, store.tags, store.study, store.attempts]);
  const number = (value: number) => value.toLocaleString('ja-JP');
  return (
    <details className="details panel records-tag-summary">
      <summary>タグ別の学習状況</summary>
      <p className="hint">現在のタグ・問題内容で集計。正答率は正解回数 ÷ 回答回数です。旧内容・削除済み問題の回答と自己評価のみの履歴は含みません。</p>
      <p className="hint">理解度は現在の問題数（正解なしのメモも含む）。複数タグの問題は各タグに重複して数えます。</p>
      {rows.length === 0 ? <p className="hint">集計する問題・タグがありません。</p> : (
        <ul className="records-tag-summary__list">
          {rows.map((row) => <li key={row.key}>
            <h3>{row.name}<span>{number(row.problemCount)}問</span></h3>
            <p>正答率 {row.accuracy === null ? '—（回答なし）'
              : `${Math.round(row.accuracy * 100)}%（正解 ${number(row.correct)} / 回答 ${number(row.answered)}回）`}</p>
            <p className="hint">理解できた {number(row.understood)}問・まだ不安 {number(row.uncertain)}問・未評価 {number(row.unrated)}問</p>
          </li>)}
        </ul>
      )}
    </details>
  );
}
