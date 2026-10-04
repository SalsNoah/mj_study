import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/app/store';
import { HandView } from '@/components/HandView';
import { TileFace } from '@/components/TileFace';
import { TilePalette } from '@/components/TilePalette';
import {
  DEFAULT_SEARCH_OPTIONS,
  searchProblems,
  type MatchReason,
  type SearchOptions,
} from '@/domain/search';
import { formatHandNotation, parseHandNotation } from '@/domain/parse';
import { isInTest } from '@/domain/quiz';
import { formatShortDate } from '@/domain/records';
import type { TileCode } from '@/domain/types';
import { LIMITS } from '@/domain/types';

type SortKey = 'updated' | 'confirmAsc' | 'lastConfirmOld' | 'lastSolvedOld';

const OPTION_ROWS: Array<{ key: keyof SearchOptions; label: string; desc: string }> = [
  { key: 'contains', label: '含む', desc: 'OFFで完全一致' },
  { key: 'colorSwap', label: '色替え', desc: '萬・筒・索を入れ替えて検索' },
  { key: 'reverse', label: '反転', desc: '1⇔9、2⇔8…も一致' },
  { key: 'shift', label: '数字のずれ', desc: '同じ形の連番も一致' },
  { key: 'distinguishRed', label: '赤牌を区別', desc: '赤五と通常五を分ける' },
  { key: 'includeMelds', label: '副露を含む', desc: '鳴いた牌も検索' },
];

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
    const oldFirst = (ta: string | null | undefined, tb: string | null | undefined) => {
      if (!ta && tb) return -1;
      if (ta && !tb) return 1;
      if (!ta && !tb) return 0;
      return (ta ?? '').localeCompare(tb ?? '');
    };
    list.sort((a, b) => {
      const sa = study.get(a.id);
      const sb = study.get(b.id);
      if (sortKey === 'updated') return b.updatedAt.localeCompare(a.updatedAt);
      if (sortKey === 'confirmAsc') {
        return (sa?.confirmationCount ?? 0) - (sb?.confirmationCount ?? 0);
      }
      if (sortKey === 'lastSolvedOld') return oldFirst(sa?.lastSolvedAt, sb?.lastSolvedAt);
      return oldFirst(sa?.lastConfirmedAt, sb?.lastConfirmedAt);
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

  const setTiles = (next: TileCode[]) => {
    setTileCodes(next);
    setTileQuery(formatHandNotation(next));
    setParseError(null);
  };

  const addTile = (code: TileCode) => {
    if (tileCodes.length >= 14) return;
    setTiles([...tileCodes, code]);
  };

  const hasSearch = !!textQuery.trim() || !!tileQuery.trim() || selectedTags.length > 0;
  const filterSummary = [
    tileQuery.trim() ? (parseError ? '牌姿の入力を確認' : `牌姿 ${tileCodes.length}枚`) : '',
    selectedTags.length > 0 ? `タグ ${selectedTags.length}件` : '',
  ].filter(Boolean).join('・');
  const clearSearch = () => {
    setTextQuery('');
    setTiles([]);
    setSelectedTags([]);
    setSearchOpts(DEFAULT_SEARCH_OPTIONS);
  };

  return (
    <div className="page page--library">
      <header className="page-header page-header--compact">
        <h1>学習帳</h1>
        <p className="count-pill" role="status">{filtered.length} 問</p>
      </header>

      <section className="panel search-panel" aria-label="問題を探す">
        <label className="field">
          <span className="sr-only">文字検索</span>
          <input
            type="search"
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
            placeholder="タイトル・解説・メモ・タグを検索"
          />
        </label>

        <details className="details library-filters">
          <summary>
            <strong>牌姿・タグで絞り込む</strong>
            {filterSummary && <span className="filter-summary">{filterSummary}</span>}
          </summary>
          <div className="search-query">
            <div className="search-query__tiles" aria-label="検索する牌">
              {tileCodes.length === 0 ? (
                <span className="hint">牌をタップして検索</span>
              ) : (
                tileCodes.map((c, i) => (
                  <TileFace
                    key={`${c}-${i}`}
                    code={c}
                    size={24}
                    onClick={() => setTiles(tileCodes.filter((_, j) => j !== i))}
                  />
                ))
              )}
            </div>
            {tileQuery.trim() && (
              <button type="button" className="btn btn-sm" onClick={() => setTiles([])}>
                クリア
              </button>
            )}
          </div>
          <TilePalette onPick={addTile} disabled={tileCodes.length >= 14} />
          <label className="field">
            <span>牌姿を文字で入力</span>
            <input
              value={tileQuery}
              onChange={(e) => setTileQuery(e.target.value)}
              placeholder="例: 234m567p"
              aria-invalid={!!parseError}
              aria-describedby={parseError ? 'library-tile-error' : undefined}
            />
          </label>
          <details className="details">
            <summary>牌姿の一致条件</summary>
            <ul className="option-list">
              {OPTION_ROWS.map((row) => (
                <li key={row.key}>
                  <label className="option-row">
                    <input
                      type="checkbox"
                      checked={searchOpts[row.key]}
                      onChange={(e) => setSearchOpts((o) => ({ ...o, [row.key]: e.target.checked }))}
                    />
                    <span className="option-row__body">
                      <strong>{row.label}</strong>
                      <span className="option-row__desc">{row.desc}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </details>
          {store.tags.length > 0 ? (
            <>
              <h2 className="mini-title">タグ</h2>
              <div className="tag-cloud">
                {store.tags.map((t) => {
                  const on = selectedTags.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`tag-chip${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => setSelectedTags((ids) => on ? ids.filter((x) => x !== t.id) : [...ids, t.id])}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
              <label className="field">
                <span>タグ条件</span>
                <select value={tagMode} onChange={(e) => setTagMode(e.target.value as 'or' | 'and')}>
                  <option value="or">いずれか（OR）</option>
                  <option value="and">すべて含む（AND）</option>
                </select>
              </label>
            </>
          ) : <p className="hint">タグはまだありません</p>}
        </details>
        {parseError && <p id="library-tile-error" className="error" role="alert">{parseError}</p>}
        {hasSearch && (
          <button type="button" className="btn btn-sm" onClick={clearSearch}>検索をクリア</button>
        )}
        <label className="inline-select">
          <span>並べ替え</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="updated">更新順</option>
            <option value="lastSolvedOld">最後に解いた日が古い順</option>
            <option value="confirmAsc">確認回数の少ない順</option>
            <option value="lastConfirmOld">最終確認が古い順</option>
          </select>
        </label>
      </section>

      {filtered.length === 0 ? (
        <div className="empty">
          <p>{store.problems.length === 0 ? 'まだ問題がありません。' : '条件に合う問題がありません。'}</p>
          {store.problems.length === 0 ? (
            <Link className="btn btn-primary" to="/">問題を作成</Link>
          ) : (
            <button type="button" className="btn btn-primary" onClick={clearSearch}>すべての問題を見る</button>
          )}
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
                    <span className="problem-card__badges">
                      {!isInTest(study) && <span className="badge badge-off">テスト対象外</span>}
                      <span className={`badge ${p.answerEnabled ? 'badge-answer' : 'badge-memo'}`}>
                        {p.answerEnabled ? '正解あり' : '正解なし'}
                      </span>
                    </span>
                  </div>
                  <div className="hand-mini">
                    <HandView concealed={p.concealed} drawn={p.drawn} melds={p.melds} tight />
                  </div>
                  <div className="problem-card__meta">
                    <span>解いた {formatShortDate(study?.lastSolvedAt)}</span>
                    {p.answerEnabled && <span>正解 {formatShortDate(study?.lastCorrectAt)}</span>}
                    <span>確認 {study?.confirmationCount ?? 0}回</span>
                  </div>
                  {p.tagIds.length > 0 && (
                    <div className="tag-cloud">
                      {p.tagIds.map((id) => (
                        <span key={id} className="tag-chip">
                          {getTagName(id)}
                        </span>
                      ))}
                    </div>
                  )}
                  {reasons && <p className="match-reason">一致: {reasons.join('・')}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
