import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/app/store';
import { HandBoard } from '@/components/HandBoard';
import { decodeSharePayload, type SharePayload } from '@/domain/share';

export function ShareReceivePage({ encoded }: { encoded: string }) {
  const { addFromShare, store } = useApp();
  const navigate = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);

  const decoded = useMemo(() => decodeSharePayload(encoded), [encoded]);

  if (!decoded.ok) {
    return (
      <div className="page">
        <h1>共有の取込</h1>
        <p className="error">{decoded.reason}</p>
        <p className="hint">壊れた共有や未知の版は拒否し、既存データは変更していません。</p>
      </div>
    );
  }

  const payload = decoded.payload;
  const maybeDup = store.problems.some(
    (p) =>
      p.title === payload.title &&
      JSON.stringify(p.concealed) === JSON.stringify(payload.concealed) &&
      p.drawn === payload.drawn,
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1>共有プレビュー（読取専用）</h1>
        <p className="hint">自動では学習帳に保存しません。</p>
      </header>
      <section className="panel">
        <h2>{payload.title.trim() || '無題の問題'}</h2>
        <HandBoard
          concealed={payload.concealed}
          drawn={payload.drawn}
          melds={payload.melds.map((m, i) => ({
            id: `preview-${i}`,
            ...m,
          }))}
          doraIndicators={payload.doraIndicators}
          context={payload.context}
        />
        {'explanation' in payload && payload.explanation && (
          <details>
            <summary>解説を見る</summary>
            <p className="prewrap">{payload.explanation}</p>
          </details>
        )}
        {'acceptedDiscards' in payload && payload.answerEnabled && (
          <details>
            <summary>正解を見る</summary>
            <p>{(payload.acceptedDiscards ?? []).join(', ')}</p>
          </details>
        )}
        {maybeDup && (
          <p className="warn">似た問題が既にあります。追加すると複製になります（上書きしません）。</p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const r = addFromShare(payload as SharePayload);
            if (!r.ok) {
              setMsg(r.reason);
              return;
            }
            const newest = r.store.problems[r.store.problems.length - 1];
            navigate(newest ? `/problems/${newest.id}` : '/');
          }}
        >
          自分の学習帳に追加
        </button>
        {msg && <p className="error">{msg}</p>}
      </section>
    </div>
  );
}
