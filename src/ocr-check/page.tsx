import { useEffect, useRef, useState } from 'react';
import { TILE_READING, isTileCode } from '@/domain/tiles';
import type { TileCell } from '@/features/import/recognize';
import { CODE_REVISION, recognizeFile, type Recognition } from './engine';
import { csv, evaluate, makeTruth, METRIC_VERSION, TYPE_NAMES, type Truth } from './metrics';

function Tiles({ cells }: { cells: TileCell[] }) {
  return <div className="tiles">{cells.length ? cells.map((c, i) => <div className={`tile ${c.sure ? '' : 'unsure'}`} key={i}>
    {c.preview && <img src={c.preview} alt="認識した切出し" />}
    <b>{c.label ?? '?'}</b><span>{c.label && isTileCode(c.label) ? TILE_READING[c.label] : c.label === 'back' ? '裏牌' : '不明'}</span>
    <small>{c.rotated ? '横向き' : '縦向き'}{!c.sure && '・要確認'}</small>
  </div>) : <p className="muted">検出なし</p>}</div>;
}
const ratio = (m: { matched: number; denominator: number; rate: number | null }) => m.rate === null ? '算出不可（分母0）' : `${m.matched} / ${m.denominator}（${(m.rate * 100).toFixed(1)}%）`;

export function OcrCheck() {
  const [phase, setPhase] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [result, setResult] = useState<Recognition | null>(null);
  const [hand, setHand] = useState('');
  const [melds, setMelds] = useState<Array<{ type: string; tiles: string }>>([]);
  const [noMelds, setNoMelds] = useState(false);
  const [truth, setTruth] = useState<Truth | null>(null);
  const [truthError, setTruthError] = useState('');
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const currentUrl = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const clear = () => {
    generation.current++; controller.current?.abort(); controller.current = null;
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = null;
    setUrl(null); setResult(null); setTruth(null); setHand(''); setMelds([]); setNoMelds(false); setTruthError(''); setZoom(1);
  };
  useEffect(() => () => { generation.current++; controller.current?.abort(); if (currentUrl.current) URL.revokeObjectURL(currentUrl.current); }, []);
  const choose = async (file: File) => {
    clear(); const id = generation.current;
    setPhase('working'); setMessage('画像を端末内で読み取り中…');
    const ctrl = new AbortController(); controller.current = ctrl;
    const nextUrl = URL.createObjectURL(file); currentUrl.current = nextUrl;
    try {
      const value = await recognizeFile(file, nextUrl, ctrl.signal);
      if (id !== generation.current) return;
      setUrl(nextUrl); setResult(value); setPhase('done'); setMessage(value.raw ? '認識結果を表示しました。正解はまだ未入力です。' : '手牌を認識できませんでした。正解を入力すれば、未検出として比較できます。');
    } catch (e) {
      if (id !== generation.current) return;
      URL.revokeObjectURL(nextUrl); currentUrl.current = null;
      setPhase('error'); setMessage(e instanceof Error ? e.message : '読み取りに失敗しました。');
    }
  };
  const invalidate = () => { setTruth(null); setTruthError(''); };
  const metrics = result && truth ? evaluate(truth, result.prediction) : null;
  const exported = result ? {
    schemaVersion: 1, engine: 'mj_study template OCR (bundled model only)', codeRevision: result.codeRevision,
    metricVersion: METRIC_VERSION, model: result.model, image: result.image, recognizedAt: result.recognizedAt,
    sampleCount: 1, status: result.raw ? 'recognized' : 'notDetected', prediction: result.prediction,
    observations: { hand: result.raw?.hand.map((c) => ({ label: c.label, sure: c.sure, rotated: c.rotated })) ?? [],
      melds: result.raw?.melds.map((group) => group.map((c) => ({ label: c.label, sure: c.sure, rotated: c.rotated, stack: 'unknown' }))) ?? [] },
    groundTruthStatus: truth ? 'userConfirmed' : 'notEntered', groundTruth: truth, metrics,
    scope: 'one image; hand and own melds; not a dataset accuracy estimate; no image bytes',
  } : null;
  const download = (format: 'json' | 'csv') => {
    if (!exported) return;
    const data = format === 'json' ? JSON.stringify(exported, null, 2) : csv([
      ['engine', 'code_revision', 'metric_version', 'model_version', 'model_sha256', 'image_name', 'image_sha256', 'image_conditions', 'sample_count', 'status', 'prediction', 'observations', 'truth_status', 'ground_truth', 'metrics'],
      [exported.engine, exported.codeRevision, METRIC_VERSION, exported.model.version, exported.model.sha256, exported.image.name, exported.image.sha256, exported.image, 1, exported.status, exported.prediction, exported.observations, exported.groundTruthStatus, truth, metrics],
    ]);
    const blobUrl = URL.createObjectURL(new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = blobUrl; a.download = `ocr-check-${result!.image.sha256.slice(0, 12)}.${format}`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };
  return <main>
    <header><a href="./">麻雀学習帳へ</a><p className="eyebrow">画像1枚を、見て確かめる</p><h1>画像認識チェック</h1>
      <p>雀魂・天鳳のスクショから、手牌と自分の副露を読み取ります。</p></header>
    <section className="privacy"><strong>画像はこの端末のブラウザ内で処理します</strong><p>GitHubや外部へ画像を送りません。学習帳の問題・教材・保存データや、端末のOCR補正見本は読み書きしません。閉じると結果は消えます。</p></section>
    <section className="card"><h2>1. 画像を選ぶ</h2>
      <label className="file-label">対局スクリーンショット<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void choose(file); }} /></label>
      <p className="muted">PNG・JPEG・WebP、20 MiB・2400万画素まで。認識時は長辺1920px以下へ縮小します。HEICはJPEG等へ変換してください。</p>
      <div className="actions">{phase === 'working' && <button onClick={() => { clear(); setPhase('idle'); setMessage('中断しました。別の画像を選べます。'); }}>中断</button>}
        {(result || phase === 'error') && <button onClick={() => { clear(); setPhase('idle'); setMessage('クリアしました。'); }}>画像と結果をクリア</button>}</div>
      <p role={phase === 'error' ? 'alert' : 'status'} aria-live="polite">{message || '画像はまだ選ばれていません。'}</p>
    </section>
    {url && <div className="comparison">
      <section className="card original"><h2>元画像</h2><label>拡大 {zoom}倍 <input aria-label="元画像の拡大" type="range" min="1" max="4" step="0.5" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
        <div className="image-scroll" tabIndex={0} aria-label="元画像。拡大後はスクロールできます"><img src={url} alt="選択した対局スクリーンショット" style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} /></div>
      </section>
      {result && <section className="card"><h2>2. 現行OCRの結果</h2><p className="muted">{result.raw?.game === 'tenhou' ? '天鳳' : result.raw ? '雀魂' : 'ゲーム判定なし'} ／ 手牌{result.prediction.hand.length}枚・副露{result.prediction.melds.length}組</p>
        <h3>手牌</h3><Tiles cells={result.raw?.hand ?? []} />
        <h3>副露（画像の左から順）</h3>{!result.prediction.melds.length && <p className="muted">検出なし</p>}
        {result.prediction.melds.map((m, i) => <div className="meld" key={i}><h4>組{i + 1}：{m.type ? TYPE_NAMES[m.type] : '種別不明'}・{m.tiles.length}牌</h4><Tiles cells={result.raw!.melds[i]!} /><p className="muted">積み牌：不明（現行OCRは上下の重なりを検出しません）</p></div>)}
        <p className="notice">「要確認」は見本との一致が弱い候補です。精度・正解率を表しません。現行版は加槓の自動判定がなく、同牌4枚を大明槓と誤判定する場合があります。</p>
      </section>}
    </div>}
    <details className="card" open><summary>牌表記の凡例・比較ルール</summary><p><b>m</b>＝萬子、<b>p</b>＝筒子、<b>s</b>＝索子。数字1〜9、<b>0</b>は赤五です。例：<code>1m 2m 0p 5p</code>。</p><p><b>1z〜7z</b>＝東・南・西・北・白・發・中。<b>?</b>＝正解不明、<b>back</b>＝牌種が分からない裏牌。暗槓でも牌種が確定できれば実4牌を入力します。</p>
      <p>手牌は順序を無視し、重複枚数と赤牌を区別します。副露は画像の左から組を対応させ、組内は順序を無視します。</p>
      <p>牌一致率＝多重集合の共通牌数 ÷ max（既知の正解枚数, 予測枚数−正解不明の枠数）。欠落・余分をともに減点します。正解の ? / back だけを除外し、既知の正解に対する認識不明は不一致です。分母0では算出しません。</p>
      <p>副露種別も組ごとに比較し、余分な組を分母へ加えます。全体完全一致は手牌・副露の牌、種別、組数がすべて一致した場合。正解不明があれば判定保留です。ドラ・点数・向きは一致率の対象外です。</p></details>
    {result && <>
      <section className="card"><h2>3. 正解を入力・確認する</h2><p>認識結果とは別に、元画像を見て入力してください。修正は何度でもできます。</p>
        <label>正解の手牌<textarea aria-label="正解の手牌" value={hand} placeholder="例：1m 1m 2m 3m 0p 5p 7z" onChange={(e) => { setHand(e.target.value); invalidate(); }} /></label>
        <p className="muted">牌なしを確認した場合は「-」。未入力の空欄とは区別します。</p>
        {melds.map((m, i) => <fieldset key={i}><legend>正解の副露 {i + 1}</legend><label>種別<select aria-label="種別" value={m.type} onChange={(e) => { setMelds(melds.map((x, j) => j === i ? { ...x, type: e.target.value } : x)); invalidate(); }}><option value="?">不明（種別のみ除外）</option>{Object.entries(TYPE_NAMES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
          <label>牌（槓は4牌）<input aria-label="牌（槓は4牌）" value={m.tiles} placeholder="例：5p 5p 0p 5p" onChange={(e) => { setMelds(melds.map((x, j) => j === i ? { ...x, tiles: e.target.value } : x)); invalidate(); }} /></label><button onClick={() => { setMelds(melds.filter((_, j) => j !== i)); setNoMelds(false); invalidate(); }}>副露{i + 1}を削除</button></fieldset>)}
        <div className="actions"><button disabled={melds.length >= 4} onClick={() => { setMelds([...melds, { type: '?', tiles: '' }]); setNoMelds(false); invalidate(); }}>副露を追加</button></div>
        {melds.length === 0 && <label className="check"><input type="checkbox" checked={noMelds} onChange={(e) => { setNoMelds(e.target.checked); invalidate(); }} />画像に副露がないことを確認しました</label>}
        <button className="primary" onClick={() => { try { if (!melds.length && !noMelds) throw new Error('副露を追加するか、副露なしを確認してください。'); setTruth(makeTruth(hand, melds)); setTruthError(''); } catch (e) { setTruth(null); setTruthError(e instanceof Error ? e.message : '入力を確認してください。'); } }}>正解を確定して比較</button>
        {truthError && <p role="alert">{truthError}</p>}
      </section>
      <section className="card" aria-label="比較結果"><h2>4. 差分と一致率</h2>{!metrics ? <p>正解未確定のため、まだ一致率を算出していません。</p> : <>
        <dl className="scores"><div><dt>手牌の牌一致</dt><dd>{ratio(metrics.hand)}</dd></div><div><dt>副露の牌一致</dt><dd>{ratio(metrics.meldTiles)}</dd></div><div><dt>副露種別の一致</dt><dd>{ratio(metrics.meldTypes)}</dd></div><div><dt>全体完全一致</dt><dd>{metrics.exact === null ? '判定保留' : metrics.exact ? '一致（1 / 1画像）' : '不一致（0 / 1画像）'}</dd></div></dl>
        <p>正解不明の除外：手牌{metrics.hand.excluded}牌・副露{metrics.meldTiles.excluded}牌・種別{metrics.meldTypes.excluded}組。認識不明：手牌{metrics.hand.predictionUnknown}牌・副露{metrics.meldTiles.predictionUnknown}牌。</p>
        <p>副露組数：正解{metrics.truthMeldCount}組 ／ 予測{metrics.predictionMeldCount}組。</p>
        <p>手牌の不足：{metrics.hand.missing.join(' ') || 'なし'}。未対応予測：{metrics.hand.unmatchedPredictions.join(' ') || 'なし'}（うち除外枠を超える余分{metrics.hand.extraCount}牌）。</p>
        {metrics.groups.map((g) => <p key={g.index}>副露{g.index + 1}：不足 {g.missing.join(' ') || 'なし'} ／ 未対応予測 {g.unmatchedPredictions.join(' ') || 'なし'} ／ 種別 {g.expectedType ? TYPE_NAMES[g.expectedType] : '不明・なし'} → {g.predictedType ? TYPE_NAMES[g.predictedType] : '不明・なし'}</p>)}
        <p className="muted">対象はこの1画像だけです。未見データ全体の認識精度を示す結果ではありません。</p></>}
      </section>
      <section className="card"><h2>結果を持ち出す</h2><p>画像本体を含めず、予測・確定した正解・分母付き指標・版情報を保存します。</p><div className="actions"><button onClick={() => download('json')}>結果JSONを保存</button><button onClick={() => download('csv')}>結果CSVを保存</button></div>
        <details><summary>画像条件・モデル・コード版</summary><dl><dt>画像</dt><dd>{result.image.name} ／ {result.image.width}×{result.image.height}px ／ {(result.image.bytes / 1024 / 1024).toFixed(2)} MiB</dd><dt>認識に使用</dt><dd>{result.image.processedWidth}×{result.image.processedHeight}px ／ EXIF方向をブラウザで適用</dd><dt>モデル</dt><dd>同梱v{result.model.version} ／ 端末の追加学習なし<br />SHA-256: {result.model.sha256}</dd><dt>コード</dt><dd>{result.codeRevision}</dd><dt>指標版</dt><dd>{METRIC_VERSION} ／ 画像1件 ／ 全体完全一致の分母 {metrics?.exactDenominator ?? '未確定'}</dd></dl></details>
      </section>
    </>}
    <footer>端末内の一時検証専用・コード {CODE_REVISION.slice(0, 8)}</footer>
  </main>;
}
