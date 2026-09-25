import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/app/store';
import { HandView } from '@/components/HandView';
import { TilePalette } from '@/components/TilePalette';
import {
  DEFAULT_SEARCH_OPTIONS,
  searchProblems,
  type MatchReason,
  type SearchOptions,
} from '@/domain/search';
import { formatHandNotation, parseHandNotation } from '@/domain/parse';
import type { TileCode } from '@/domain/types';
import { LIMITS } from '@/domain/types';

type SortKey = 'updated' | 'confirmAsc' | 'lastConfirmOld';

export function LibraryPage() {
  const { store, getTagName } = useApp();
  const [textQuery, setTextQuery] = useState('');
  const [tileQuery, setTileQuery] = useState('');
  const [tileCodes, setTileCodes] = useState<TileCode[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'or' | 'and'>('or');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [searchOpts, setSearchOpts] = useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (!tileQuery.trim()) {
        setTileCodes([]);
        setParseError(null);
        return;
      }
      const parsed = parseHandNotation(tileQuery);
      if (!parsed.ok) {
        setParseError(parsed.reason);
        setTileCodes([]);
        return;
      }
      setParseError(null);
      setTileCodes(parsed.tiles);
    }, LIMITS.searchDebounceMs);
    return () => window.clearTimeout(handle);
  }, [tileQuery]);

  const { filtered, matchReasons } = useMemo(() => {
    let list = [...store.problems];
    const q = textQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const tags = p.tagIds.map(getTagName).join(' ');
        return (
          p.title.toLowerCase().includes(q) ||
          p.explanation.toLowerCase().includes(q) ||
          p.privateMemo.toLowerCase().includes(q) ||
          tags.toLowerCase().includes(q)
        );
      });
    }
    if (selectedTags.length) {
      list = list.filter((p) => {
        if (tagMode === 'and') return selectedTags.every((id) => p.tagIds.includes(id));
        return selectedTags.some((id) => p.tagIds.includes(id));
      });
    }

    const reasons = new Map<string, MatchReason[]>();
    if (tileCodes.length && !parseError) {
      const matches = searchProblems(list, tileCodes, searchOpts);
      const ids = new Set(matches.map((m) => m.problemId));
      for (const m of matches) reasons.set(m.problemId, m.reasons);
      list = list.filter((p) => ids.has(p.id));
    }

    const study = new Map(store.study.map((s) => [s.problemId, s]));
    list.sort((a, b) => {
      const sa = study.get(a.id);
      const sb = study.get(b.id);
      if (sortKey === 'updated') return b.updatedAt.localeCompare(a.updatedAt);
      if (sortKey === 'confirmAsc') {
        return (sa?.confirmationCount ?? 0) - (sb?.confirmationCount ?? 0);
      }
      const ta = sa?.lastConfirmedAt;
      const tb = sb?.lastConfirmedAt;
      if (!ta && tb) return -1;
      if (ta && !tb) return 1;
      if (!ta && !tb) return 0;
      return (ta ?? '').localeCompare(tb ?? '');
    });
    return { filtered: list, matchReasons: reasons };
  }, [
    store.problems,
    store.study,
    textQuery,
    selectedTags,
    tagMode,
    tileCodes,
    parseError,
    searchOpts,
    sortKey,
    getTagName,
  ]);

  const addTile = (code: TileCode) => {
    const next = [...tileCodes, code];
    setTileCodes(next);
    setTileQuery(formatHandNotation(next));
    setParseError(null);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="brand">麻雀学習帳</h1>
        <p className="lede">牌姿を記録し、形で探し、復習する</p>
      </header>

      <section className="panel">
        <label className="field">
          <span>文字検索</span>
          <input
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
            placeholder="タイトル・解説・メモ・タグ"
          />
        </label>
        <label className="field">
          <span>牌姿検索</span>
          <input
            value={tileQuery}
            onChange={(e) => setTileQuery(e.target.value)}
            placeholder="例: 234m567p"
            aria-invalid={!!parseError}
          />
        </label>
        {parseError && <p className="error">{parseError}</p>}
        <details className="details">
          <summary>牌パレットで入力</summary>
          <TilePalette onPick={addTile} />
        </details>
        <details className="details">
          <summary>牌姿検索オプション</summary>
          <div className="check-grid">
            {(
              [
                ['contains', '含む（OFFで完全一致）'],
                ['colorSwap', '色替え'],
                ['reverse', '反転'],
                ['shift', '数字のずれ'],
                ['distinguishRed', '赤牌を区別'],
                ['includeMelds', '副露を含む'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="check">
                <input
                  type="checkbox"
                  checked={searchOpts[key]}
                  onChange={(e) =>
                    setSearchOpts((o) => ({ ...o, [key]: e.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </details>
        <div className="field-row">
          <label className="field">
            <span>並べ替え</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="updated">更新順</option>
              <option value="confirmAsc">確認回数の少ない順</option>
              <option value="lastConfirmOld">最終確認が古い順</option>
            </select>
          </label>
          <label className="field">
            <span>タグ条件</span>
            <select value={tagMode} onChange={(e) => setTagMode(e.target.value as 'or' | 'and')}>
              <option value="or">いずれか（OR）</option>
              <option value="and">すべて含む（AND）</option>
            </select>
          </label>
        </div>
        {store.tags.length > 0 && (
          <div className="tag-cloud">
            {store.tags.map((t) => {
              const on = selectedTags.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`tag-chip${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() =>
                    setSelectedTags((ids) =>
                      on ? ids.filter((x) => x !== t.id) : [...ids, t.id],
                    )
                  }
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {filtered.length === 0 ? (
        <div className="empty">
          <p>問題がありません。</p>
          <Link className="btn btn-primary" to="/">
            新規作成
          </Link>
        </div>
      ) : (
        <ul className="problem-list">
          {filtered.map((p) => {
            const study = store.study.find((s) => s.problemId === p.id);
            const reasons = matchReasons.get(p.id);
            return (
              <li key={p.id}>
                <Link className="problem-card" to={`/problems/${p.id}`}>
                  <div className="problem-card__top">
                    <strong>{p.title.trim() || '無題の問題'}</strong>
                    <span className={`badge ${p.answerEnabled ? 'badge-answer' : 'badge-memo'}`}>
                      {p.answerEnabled ? '正解あり' : '正解なし'}
                    </span>
                  </div>
                  <HandView
                    concealed={p.concealed}
                    drawn={p.drawn}
                    melds={p.melds}
                    size={28}
                  />
                  <div className="problem-card__meta">
                    <span>確認 {study?.confirmationCount ?? 0}</span>
                    <span>
                      {study?.understanding === 'understood'
                        ? '理解できた'
                        : study?.understanding === 'uncertain'
                          ? 'まだ不安'
                          : '未評価'}
                    </span>
                    <span>
                      {study?.lastConfirmedAt
                        ? new Date(study.lastConfirmedAt).toLocaleString()
                        : '未確認'}
                    </span>
                  </div>
                  <div className="tag-cloud">
                    {p.tagIds.map((id) => (
                      <span key={id} className="tag-chip">
                        {getTagName(id)}
                      </span>
                    ))}
                  </div>
                  {reasons && (
                    <p className="match-reason">一致: {reasons.join('・')}</p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
