import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TileFace } from '@/components/TileFace';
import { TilePalette } from '@/components/TilePalette';
import { isTileCode } from '@/domain/tiles';
import { emptyContext, type Meld, type TileCode, type Wind } from '@/domain/types';
import { putImportDraft } from './draft';
import type { Img } from './imageTools';
import {
  inferMeld,
  parseRound,
  parseScore,
  parseSeat,
  parseTurn,
  scoreChars,
  scoresBySeat,
  WIND_CHARS,
  type Seat,
} from './parse';
import {
  aspectKey,
  GAME_LABELS,
  loadBank,
  loadLayout,
  resetGame,
  saveBank,
  saveLayout,
  type Game,
  type GameBank,
  type Layout,
  type RegionKey,
  type RelRect,
} from './profiles';
import {
  loadImage,
  readGlyphs,
  readMelds,
  readRiver,
  readTiles,
  rematch,
  type GlyphCell,
  type TileCell,
  type Turn,
} from './recognize';
import { RectPicker } from './RectPicker';
import { SheetLearner } from './SheetLearner';
import { labelCount, learn, prepareBank } from './templates';

const REGIONS: Array<{ key: RegionKey; label: string; color: string }> = [
  { key: 'hand', label: '手牌', color: '#1b4d3e' },
  { key: 'melds', label: '鳴き', color: '#2f8a6a' },
  { key: 'dora', label: 'ドラ', color: '#b07d0c' },
  { key: 'round', label: '場・局', color: '#6d45a8' },
  { key: 'seat', label: '自風', color: '#9b59b6' },
  { key: 'river', label: '自分の河', color: '#8b4a1f' },
  { key: 'turnText', label: '巡目の文字', color: '#8b4a1f' },
  { key: 'scoreSelf', label: '点:自分', color: '#c0392b' },
  { key: 'scoreRight', label: '点:下家', color: '#d35400' },
  { key: 'scoreAcross', label: '点:対面', color: '#16a085' },
  { key: 'scoreLeft', label: '点:上家', color: '#2c7fb8' },
];

/** 自分以外の点数は、その人の向きに合わせて回転して表示される。先頭が見本のないときの向き */
const SCORE_REGIONS: Array<{ key: GlyphKey; seat: Seat; label: string; turns: Turn[] }> = [
  { key: 'scoreSelf', seat: 'self', label: '自分', turns: [0] },
  { key: 'scoreRight', seat: 'right', label: '下家', turns: [90, 270] },
  { key: 'scoreAcross', seat: 'across', label: '対面', turns: [180, 0] },
  { key: 'scoreLeft', seat: 'left', label: '上家', turns: [270, 90] },
];

const WIND_BY_CODE: Record<Wind, string> = { '1z': '東', '2z': '南', '3z': '西', '4z': '北' };

type GlyphKey =
  | 'round'
  | 'seat'
  | 'turnText'
  | 'scoreSelf'
  | 'scoreRight'
  | 'scoreAcross'
  | 'scoreLeft';

type Fields = {
  roundWind: Wind | null;
  handNumber: number | null;
  honba: number | null;
  seatWind: Wind | null;
  turn: number | null;
  scores: Record<Seat, number | null>;
};

const EMPTY_FIELDS: Fields = {
  roundWind: null,
  handNumber: null,
  honba: null,
  seatWind: null,
  turn: null,
  scores: { self: null, right: null, across: null, left: null },
};

type Target =
  | { kind: 'hand'; i: number }
  | { kind: 'dora'; i: number }
  | { kind: 'meld'; g: number; i: number };

type Cell = TileCell & { corrected?: boolean };

function firstUnsure(hand: Cell[], dora: Cell[], melds: Cell[][]): Target | null {
  const hi = hand.findIndex((c) => !c.sure);
  if (hi >= 0) return { kind: 'hand', i: hi };
  const di = dora.findIndex((c) => !c.sure);
  if (di >= 0) return { kind: 'dora', i: di };
  for (let g = 0; g < melds.length; g++) {
    const mi = melds[g]!.findIndex((c) => !c.sure);
    if (mi >= 0) return { kind: 'meld', g, i: mi };
  }
  return null;
}

function narrowFiltered(cells: GlyphCell[]): GlyphCell[] {
  if (cells.length < 3) return cells;
  const widths = [...cells.map((c) => c.width)].sort((a, b) => a - b);
  const median = widths[Math.floor(widths.length / 2)]!;
  return cells.filter((c) => c.width >= median * 0.45);
}

function ReadCell({ cell, active, onClick }: { cell: Cell; active: boolean; onClick: () => void }) {
  const code = cell.label && isTileCode(cell.label) ? cell.label : null;
  return (
    <button
      type="button"
      className={`read-cell${cell.sure ? '' : ' is-unsure'}${active ? ' is-active' : ''}${
        cell.rotated ? ' is-rotated' : ''
      }`}
      onClick={onClick}
      aria-label={code ? `読み取り結果 ${code}` : '未確定の牌'}
    >
      {code ? (
        <TileFace code={code} fluid />
      ) : cell.label === 'back' ? (
        <span className="tile-back" />
      ) : (
        <img src={cell.preview} alt="" />
      )}
      {!cell.sure && <span className="read-cell__q">?</span>}
    </button>
  );
}

export function ImportPage() {
  const navigate = useNavigate();
  const [game, setGame] = useState<Game>('jantama');
  const [url, setUrl] = useState<string | null>(null);
  const [full, setFull] = useState<Img | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [bank, setBank] = useState<GameBank>(() => loadBank('jantama'));
  const [active, setActive] = useState<RegionKey | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hand, setHand] = useState<Cell[]>([]);
  const [dora, setDora] = useState<Cell[]>([]);
  const [melds, setMelds] = useState<Cell[][]>([]);
  const [handCount, setHandCount] = useState<number | null>(null);
  const [handGeom, setHandGeom] = useState<{ tileW: number; boxH: number } | null>(null);
  const [glyphs, setGlyphs] = useState<Partial<Record<GlyphKey, GlyphCell[]>>>({});
  const [riverFrac, setRiverFrac] = useState<number | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [target, setTarget] = useState<Target | null>(null);
  const [read, setRead] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doraFresh, setDoraFresh] = useState(false);
  const [sheetOpenAtStart] = useState(() => labelCount(loadBank('jantama').tiles) === 0);
  const recognize = useCallback(
    (img: Img, lay: Layout, gb: GameBank, forcedHand: number | null, includeDora: boolean) => {
      const r = lay.regions;
      const tilesBank = prepareBank(gb.tiles);
      const glyphBank = prepareBank(gb.glyphs);

      let nextHand: Cell[] = [];
      if (r.hand) {
        const res = readTiles(img, r.hand, tilesBank, lay.tileAspect, forcedHand ?? undefined);
        nextHand = res.cells;
        setHandGeom({ tileW: res.tileW, boxH: res.boxH });
      }
      const nextDora: Cell[] =
        r.dora && includeDora ? readTiles(img, r.dora, tilesBank, lay.tileAspect).cells : [];
      const nextMelds: Cell[][] = r.melds ? readMelds(img, r.melds, tilesBank, lay.tileAspect) : [];

      const g: Partial<Record<GlyphKey, GlyphCell[]>> = {};
      if (r.round) g.round = readGlyphs(img, r.round, glyphBank, { mergeNarrow: true }).cells;
      if (r.seat) g.seat = readGlyphs(img, r.seat, glyphBank, { mergeNarrow: true }).cells;
      if (r.turnText) g.turnText = readGlyphs(img, r.turnText, glyphBank, { mergeNarrow: false }).cells;
      for (const s of SCORE_REGIONS) {
        const rect = r[s.key];
        if (rect) {
          g[s.key] = readGlyphs(img, rect, glyphBank, {
            mergeNarrow: false,
            turns: s.turns,
            dropSmall: true,
          }).cells;
        }
      }
      const labelsOf = (cells?: GlyphCell[]) => (cells ?? []).map((c) => c.label ?? '');

      const round = parseRound(labelsOf(g.round));
      const next: Fields = {
        roundWind: round.roundWind,
        handNumber: round.handNumber,
        honba: round.honba,
        seatWind: parseSeat(labelsOf(g.seat)),
        turn: null,
        scores: { self: null, right: null, across: null, left: null },
      };
      for (const s of SCORE_REGIONS) {
        next.scores[s.seat] = parseScore(labelsOf(g[s.key]), lay.scoreUnit);
      }
      if (r.river) {
        const river = readRiver(img, r.river, lay.riverTileFraction);
        setRiverFrac(river.brightFrac);
        next.turn = Math.min(18, river.count + 1);
      } else setRiverFrac(null);
      const turnFromText = parseTurn(labelsOf(g.turnText));
      if (turnFromText !== null) next.turn = turnFromText;

      setHand(nextHand);
      if (includeDora || !lay.doraEachTime) setDora(nextDora);
      setMelds(nextMelds);
      setGlyphs(g);
      setFields(next);
      setTarget(firstUnsure(nextHand, nextDora, nextMelds));
      setRead(true);
    },
    [],
  );

  const openImage = useCallback(
    async (file: Blob, g: Game = game) => {
      setError(null);
      setMsg(null);
      try {
        const { img, url: u } = await loadImage(file);
        if (url) URL.revokeObjectURL(url);
        const lay = loadLayout(g, aspectKey(img.width, img.height));
        const gb = loadBank(g);
        setUrl(u);
        setFull(img);
        setLayout(lay);
        setBank(gb);
        setHandCount(null);
        setRead(false);
        setHand([]);
        setDora([]);
        setMelds([]);
        setFields(EMPTY_FIELDS);
        setDoraFresh(false);
        if (lay.regions.hand) {
          recognize(img, lay, gb, null, !lay.doraEachTime);
          if (lay.doraEachTime) {
            setActive('dora');
            setMsg('読み取りました。ドラ表示牌の位置は毎回変わるので、画像の上でドラ表示牌を囲んでください。');
          } else {
            setActive(null);
            setMsg('この画面サイズの範囲設定を使って読み取りました。');
          }
        } else {
          setActive('hand');
          setMsg('初回だけ、各項目の範囲を画像の上で指でなぞってください。');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '画像を読み込めません');
      }
    },
    [game, recognize, url],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) void openImage(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [openImage]);

  const switchGame = (g: Game) => {
    setGame(g);
    setBank(loadBank(g));
    if (full) {
      const lay = loadLayout(g, aspectKey(full.width, full.height));
      setLayout(lay);
      if (lay.regions.hand) recognize(full, lay, loadBank(g), null, !lay.doraEachTime);
    }
  };

  const onRegionRect = (rect: RelRect) => {
    if (!active || !layout) return;
    const next = { ...layout, regions: { ...layout.regions, [active]: rect } };
    setLayout(next);
    const err = saveLayout(next);
    if (err) setError(err);
    if (active === 'dora' && full && read) {
      const cells = readTiles(full, rect, prepareBank(bank.tiles), next.tileAspect).cells;
      setDora(cells);
      setDoraFresh(true);
      setTarget(firstUnsure(hand, cells, melds));
      setActive(null);
      setMsg(null);
      return;
    }
    const idx = REGIONS.findIndex((r) => r.key === active);
    const nextEmpty = REGIONS.slice(idx + 1).find((r) => !next.regions[r.key]);
    setActive(nextEmpty?.key ?? null);
  };

  const clearRegion = (key: RegionKey) => {
    if (!layout) return;
    const regions = { ...layout.regions };
    delete regions[key];
    const next = { ...layout, regions };
    setLayout(next);
    saveLayout(next);
  };

  const cellAt = (t: Target): Cell | undefined =>
    t.kind === 'hand' ? hand[t.i] : t.kind === 'dora' ? dora[t.i] : melds[t.g]?.[t.i];

  const pick = (label: string) => {
    if (!target) return;
    const cell = cellAt(target);
    if (!cell) return;
    const updated: Cell = { ...cell, label, sure: true, corrected: true };
    let nh = hand;
    let nd = dora;
    let nm = melds;
    const t = target;
    if (t.kind === 'hand') nh = hand.map((c, i) => (i === t.i ? updated : c));
    else if (t.kind === 'dora') nd = dora.map((c, i) => (i === t.i ? updated : c));
    else {
      const { g: tg, i: ti } = t;
      nm = melds.map((g, gi) => (gi === tg ? g.map((c, i) => (i === ti ? updated : c)) : g));
    }
    const nb = { ...bank, tiles: learn(bank.tiles, label, cell.feat) };
    const prepared = prepareBank(nb.tiles);
    nh = nh.map((c) => rematch(c, prepared));
    nd = nd.map((c) => rematch(c, prepared));
    nm = nm.map((g) => g.map((c) => rematch(c, prepared)));
    setHand(nh);
    setDora(nd);
    setMelds(nm);
    setBank(nb);
    const err = saveBank(game, nb);
    if (err) setError(err);
    setTarget(firstUnsure(nh, nd, nm));
  };

  /** 推測が付いている「?」の牌をまとめて確定し、見本として覚える（推測のない牌は残す） */
  const acceptGuesses = () => {
    let tiles = bank.tiles;
    const confirm = (c: Cell): Cell => {
      if (c.sure || !c.label) return c;
      tiles = learn(tiles, c.label, c.feat);
      return { ...c, sure: true, corrected: true };
    };
    const nh = hand.map(confirm);
    const nd = dora.map(confirm);
    const nm = melds.map((g) => g.map(confirm));
    setHand(nh);
    setDora(nd);
    setMelds(nm);
    const nb = { ...bank, tiles };
    setBank(nb);
    const err = saveBank(game, nb);
    if (err) setError(err);
    setTarget(firstUnsure(nh, nd, nm));
  };

  const removeTarget = () => {
    if (!target) return;
    let nh = hand;
    let nd = dora;
    let nm = melds;
    const t = target;
    if (t.kind === 'hand') nh = hand.filter((_, i) => i !== t.i);
    else if (t.kind === 'dora') nd = dora.filter((_, i) => i !== t.i);
    else {
      const { g: tg, i: ti } = t;
      nm = melds
        .map((g, gi) => (gi === tg ? g.filter((_, i) => i !== ti) : g))
        .filter((g) => g.length);
    }
    setHand(nh);
    setDora(nd);
    setMelds(nm);
    setTarget(firstUnsure(nh, nd, nm));
  };

  const changeHandCount = (n: number) => {
    if (!full || !layout || n < 1 || n > 14) return;
    setHandCount(n);
    const res = readTiles(full, layout.regions.hand!, prepareBank(bank.tiles), layout.tileAspect, n);
    setHand(res.cells);
    setHandGeom({ tileW: res.tileW, boxH: res.boxH });
    setTarget(firstUnsure(res.cells, dora, melds));
  };

  const send = () => {
    if (!layout) return;
    const unlabeled = [...hand, ...dora, ...melds.flat()].some((c) => !c.label);
    if (unlabeled) {
      setError('「?」の牌をすべて選んでから進んでください');
      return;
    }
    const builtMelds: Meld[] = [];
    for (const [gi, g] of melds.entries()) {
      const r = inferMeld(g);
      if (!r.ok) {
        setError(`鳴き${gi + 1}組目：${r.reason}（不要な牌は選んで除外できます）`);
        return;
      }
      builtMelds.push(r.meld);
    }
    const handMax = Math.max(0, 14 - builtMelds.length * 3);
    if (hand.length > handMax) {
      setError(`鳴きが${builtMelds.length}組あるので手牌は${handMax}枚までです。枚数（−）か除外で直してください`);
      return;
    }

    // 見本の学習：確定した牌、入力し直した場・局・自風・点数・巡目を次回の読み取りに使う
    let tiles = bank.tiles;
    for (const c of [...hand, ...dora, ...melds.flat()]) {
      if (!c.corrected && c.label && (tiles[c.label]?.length ?? 0) < 2) tiles = learn(tiles, c.label, c.feat);
    }
    let gl = bank.glyphs;
    const teach = (cells: GlyphCell[] | undefined, chars: string[]) => {
      if (!cells?.length || !chars.length) return;
      let list = cells;
      if (list.length !== chars.length) list = narrowFiltered(cells);
      if (list.length === chars.length) list.forEach((c, i) => (gl = learn(gl, chars[i]!, c.feat)));
    };
    if (fields.roundWind) {
      const chars = [WIND_BY_CODE[fields.roundWind]];
      if (fields.handNumber) chars.push(String(fields.handNumber));
      const cells = glyphs.round ?? [];
      if (cells.length === chars.length + 1) teach(cells, [...chars, '局']);
      else teach(cells.slice(0, chars.length), chars);
    }
    if (fields.seatWind && glyphs.seat?.length) {
      const widest = [...glyphs.seat].sort((a, b) => b.width - a.width)[0]!;
      gl = learn(gl, WIND_BY_CODE[fields.seatWind], widest.feat);
    }
    if (fields.turn && glyphs.turnText?.length) {
      const chars = String(fields.turn).split('');
      if (glyphs.turnText.length >= chars.length) teach(glyphs.turnText.slice(0, chars.length), chars);
    }
    // 自分の点数（正位置）で数字を覚えてから、回転して表示される他家の点数を読み直して向きを決め、そこからも覚える
    const self = SCORE_REGIONS[0]!;
    const selfValue = fields.scores[self.seat];
    if (selfValue !== null) teach(glyphs[self.key], scoreChars(selfValue, layout.scoreUnit));
    for (const s of SCORE_REGIONS.slice(1)) {
      const v = fields.scores[s.seat];
      const rect = layout.regions[s.key];
      if (v === null || !rect || !full) continue;
      const reread = readGlyphs(full, rect, prepareBank(gl), {
        mergeNarrow: false,
        turns: s.turns,
        dropSmall: true,
      });
      teach(reread.cells, scoreChars(v, layout.scoreUnit));
    }
    const nextBank = { tiles, glyphs: gl };
    let nextLayout = layout;
    if (fields.turn && fields.turn > 1 && riverFrac !== null) {
      nextLayout = { ...nextLayout, riverTileFraction: riverFrac / (fields.turn - 1) };
    }
    if (handCount && handGeom) nextLayout = { ...nextLayout, tileAspect: handGeom.tileW / handGeom.boxH };
    saveBank(game, nextBank);
    saveLayout(nextLayout);

    const scoresGiven = Object.values(fields.scores).some((v) => v !== null);
    const concealed = hand.map((c) => c.label as TileCode);
    putImportDraft({
      concealed,
      melds: builtMelds,
      doraIndicators: dora
        .filter((c) => c.label !== 'back')
        .map((c) => c.label as TileCode)
        .slice(0, 5),
      context: {
        ...emptyContext(),
        roundWind: fields.roundWind,
        handNumber: fields.handNumber,
        honba: fields.honba,
        seatWind: fields.seatWind,
        turn: fields.turn,
        scores:
          fields.seatWind && scoresGiven
            ? scoresBySeat(fields.seatWind, fields.scores)
            : emptyContext().scores,
      },
    });
    navigate('/');
  };

  const target0 = target ? cellAt(target) : undefined;
  const unsureCount = [...hand, ...dora, ...melds.flat()].filter((c) => !c.sure).length;
  const scoresWithoutSeat =
    !fields.seatWind && Object.values(fields.scores).some((v) => v !== null);

  const setScore = (seat: Seat, v: string) =>
    setFields((f) => ({ ...f, scores: { ...f.scores, [seat]: v === '' ? null : Number(v) } }));

  return (
    <div className="page page--import">
      <header className="page-header page-header--compact">
        <h1>スクショから作成</h1>
        <div className="seg" role="group" aria-label="ゲーム">
          {(Object.keys(GAME_LABELS) as Game[]).map((g) => (
            <button key={g} type="button" className={game === g ? 'is-on' : ''} onClick={() => switchGame(g)}>
              {GAME_LABELS[g]}
            </button>
          ))}
        </div>
      </header>

      <section className="panel">
        <label className="file-pick">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void openImage(f);
              e.target.value = '';
            }}
          />
          <strong>{url ? '別のスクショを選ぶ' : 'スクショを選ぶ'}</strong>
          <span>PCでは Ctrl+V で貼り付けもできます</span>
        </label>
        <p className="hint">
          学習済み：牌 {labelCount(bank.tiles)} 種・文字 {labelCount(bank.glyphs)} 種（{GAME_LABELS[game]}）。
          画像は端末の外に送りません。
        </p>
        {msg && <p className="ok">{msg}</p>}
      </section>

      <details className="details panel" open={sheetOpenAtStart}>
        <summary>牌一覧からまとめて覚える（{GAME_LABELS[game]}）</summary>
        <SheetLearner
          tiles={bank.tiles}
          onLearn={(tiles) => {
            const nb = { ...bank, tiles };
            setBank(nb);
            const err = saveBank(game, nb);
            if (err) setError(err);
            if (full && layout?.regions.hand) {
              recognize(full, layout, nb, handCount, !layout.doraEachTime || doraFresh);
            }
          }}
        />
      </details>

      {url && layout && (
        <section className="panel">
          <div className="region-chips" role="group" aria-label="範囲を指定する項目">
            {REGIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`region-chip${active === r.key ? ' is-on' : ''}${layout.regions[r.key] ? ' is-set' : ''}`}
                style={{ ['--chip' as string]: r.color }}
                onClick={() => setActive(active === r.key ? null : r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="shot-tools">
            <span className="hint">
              {active
                ? `「${REGIONS.find((r) => r.key === active)!.label}」の範囲をなぞってください`
                : '項目を選ぶと範囲を指定し直せます（選択中は画像のスクロール不可）'}
            </span>
            <div className="seg" role="group" aria-label="拡大">
              {[1, 2, 3].map((z) => (
                <button key={z} type="button" className={zoom === z ? 'is-on' : ''} onClick={() => setZoom(z)}>
                  ×{z}
                </button>
              ))}
            </div>
          </div>
          <RectPicker
            url={url}
            alt="読み取るスクショ"
            drawing={!!active}
            zoom={zoom}
            onRect={onRegionRect}
            rects={REGIONS.flatMap((r) => {
              const rect = layout.regions[r.key];
              return rect ? [{ key: r.key, label: r.label, color: r.color, rect, active: active === r.key }] : [];
            })}
          />
          <div className="btn-row btn-row--compact">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!layout.regions.hand}
              onClick={() =>
                full && recognize(full, layout, bank, handCount, !layout.doraEachTime || doraFresh)
              }
            >
              {read ? '読み取り直す' : '読み取る'}
            </button>
            {active && layout.regions[active] && (
              <button type="button" className="btn" onClick={() => clearRegion(active)}>
                この範囲を消す
              </button>
            )}
            <label className="inline-check">
              <input
                type="checkbox"
                checked={layout.scoreUnit === 100}
                onChange={(e) => {
                  const next = { ...layout, scoreUnit: e.target.checked ? 100 : 1 };
                  setLayout(next);
                  saveLayout(next);
                }}
              />
              点数は百点単位で表示
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={!!layout.doraEachTime}
                onChange={(e) => {
                  const next = { ...layout, doraEachTime: e.target.checked };
                  setLayout(next);
                  saveLayout(next);
                }}
              />
              ドラの位置が毎回変わる
            </label>
          </div>
        </section>
      )}

      {read && (
        <>
          <section className="panel read-panel">
            <div className="read-head">
              <h2 className="mini-title">手牌</h2>
              <span className="read-count">
                <button type="button" className="btn btn-sm" onClick={() => changeHandCount(hand.length - 1)}>
                  −
                </button>
                {hand.length}枚
                <button type="button" className="btn btn-sm" onClick={() => changeHandCount(hand.length + 1)}>
                  ＋
                </button>
              </span>
            </div>
            <div className="read-row">
              {hand.map((c, i) => (
                <ReadCell
                  key={i}
                  cell={c}
                  active={target?.kind === 'hand' && target.i === i}
                  onClick={() => setTarget({ kind: 'hand', i })}
                />
              ))}
            </div>

            {dora.length > 0 && (
              <>
                <h2 className="mini-title">ドラ表示牌</h2>
                <div className="read-row read-row--small">
                  {dora.map((c, i) => (
                    <ReadCell
                      key={i}
                      cell={c}
                      active={target?.kind === 'dora' && target.i === i}
                      onClick={() => setTarget({ kind: 'dora', i })}
                    />
                  ))}
                </div>
              </>
            )}

            {melds.length > 0 && (
              <>
                <h2 className="mini-title">鳴き</h2>
                <div className="read-melds">
                  {melds.map((g, gi) => {
                    const r = g.every((c) => c.label) ? inferMeld(g) : null;
                    return (
                      <div key={gi} className="read-meld">
                        <div className="read-row read-row--small">
                          {g.map((c, i) => (
                            <ReadCell
                              key={i}
                              cell={c}
                              active={target?.kind === 'meld' && target.g === gi && target.i === i}
                              onClick={() => setTarget({ kind: 'meld', g: gi, i })}
                            />
                          ))}
                        </div>
                        <span className="read-meld__type">
                          {r
                            ? r.ok
                              ? { chi: 'チー', pon: 'ポン', openKan: '明槓', closedKan: '暗槓', addedKan: '加槓' }[r.meld.type]
                              : '判定できません'
                            : '未確定'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {unsureCount > 0 && (
              <>
                <p className="hint">
                  「?」は自信のない推測です。違う牌だけタップして直し、残りが合っていれば「推測どおりで確定」を押してください（次回から自動で読めます）。
                </p>
                <button type="button" className="btn btn-sm" onClick={acceptGuesses}>
                  推測どおりで確定
                </button>
              </>
            )}
          </section>

          {target && target0 && (
            <section className="panel picker-panel">
              <div className="picker-head">
                <img src={target0.preview} alt="選択中の牌" className="picker-crop" />
                <span>この牌を選んでください</span>
                <button type="button" className="btn btn-sm" onClick={removeTarget}>
                  牌ではない（除外）
                </button>
                {target.kind !== 'hand' && (
                  <button type="button" className="btn btn-sm" onClick={() => pick('back')}>
                    裏向き
                  </button>
                )}
              </div>
              <TilePalette onPick={(code) => pick(code)} />
            </section>
          )}

          <section className="panel">
            <h2 className="mini-title">対局条件（読み取り結果・直せます）</h2>
            <div className="ctx-toolbar">
              <div className="seg" role="group" aria-label="場風">
                {(['1z', '2z'] as Wind[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={fields.roundWind === w ? 'is-on' : ''}
                    onClick={() => setFields((f) => ({ ...f, roundWind: w }))}
                  >
                    {WIND_BY_CODE[w]}
                  </button>
                ))}
              </div>
              <label className="ctx-mini">
                <select
                  aria-label="局"
                  value={fields.handNumber ?? ''}
                  onChange={(e) =>
                    setFields((f) => ({ ...f, handNumber: e.target.value ? Number(e.target.value) : null }))
                  }
                >
                  <option value="">局</option>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}局
                    </option>
                  ))}
                </select>
              </label>
              <div className="seg" role="group" aria-label="自風">
                {(Object.keys(WIND_CHARS) as string[]).map((ch) => {
                  const w = WIND_CHARS[ch]!;
                  return (
                    <button
                      key={w}
                      type="button"
                      className={fields.seatWind === w ? 'is-on' : ''}
                      onClick={() => setFields((f) => ({ ...f, seatWind: w }))}
                    >
                      {ch}
                    </button>
                  );
                })}
              </div>
              <label className="ctx-mini">
                <select
                  aria-label="巡目"
                  value={fields.turn ?? ''}
                  onChange={(e) =>
                    setFields((f) => ({ ...f, turn: e.target.value ? Number(e.target.value) : null }))
                  }
                >
                  <option value="">巡目</option>
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}巡
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="ctx-scores" aria-label="点数状況">
              <span className="ctx-scores__label">点数</span>
              {SCORE_REGIONS.map((s) => (
                <label key={s.seat} className="ctx-score">
                  <span>{s.label}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={fields.scores[s.seat] ?? ''}
                    onChange={(e) => setScore(s.seat, e.target.value)}
                  />
                </label>
              ))}
            </div>
            {scoresWithoutSeat && <p className="warn">自風を選ぶと点数を東南西北に割り当てられます。</p>}
            <p className="hint">巡目は自分の河の枚数＋1で計算しています。直すと次回から精度が上がります。</p>
          </section>

          {error && <p className="error">{error}</p>}
          <div className="sticky-actions">
            <button type="button" className="btn btn-primary btn-save" onClick={send}>
              この内容で問題を作成
            </button>
          </div>
        </>
      )}

      {!read && error && <p className="error">{error}</p>}

      <details className="details panel">
        <summary>学習データ</summary>
        <p className="hint">
          範囲の設定は画面の縦横比ごと、牌と文字の見本はゲームごとに、このブラウザに保存されます。
        </p>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (!window.confirm(`${GAME_LABELS[game]}の範囲設定と見本をすべて消しますか？`)) return;
            resetGame(game);
            setBank(loadBank(game));
            if (full) setLayout(loadLayout(game, aspectKey(full.width, full.height)));
            setRead(false);
          }}
        >
          {GAME_LABELS[game]}の学習データを消す
        </button>
      </details>
    </div>
  );
}
