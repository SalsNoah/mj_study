import { useState } from 'react';
import { TileFace } from '@/components/TileFace';
import type { TileCode } from '@/domain/types';
import { crop, cropBrightRows, tileFeature, type Img } from './imageTools';
import type { RelRect } from './profiles';
import { RectPicker, type PickerRect } from './RectPicker';
import { loadImage, relToPx, toDataUrl } from './recognize';
import { learn, type Bank } from './templates';

const nums = (suit: string, red: boolean): TileCode[] => {
  const list = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => `${n}${suit}` as TileCode);
  return red ? [...list, `0${suit}` as TileCode] : list;
};

/** 牌一覧の1行の種類。並び順どおりに囲んだ範囲を等分する */
const ROW_KINDS: Array<{ id: string; label: string; tiles: TileCode[] }> = [
  { id: 'm', label: '萬子 1〜9', tiles: nums('m', false) },
  { id: 'm0', label: '萬子 1〜9＋赤5', tiles: nums('m', true) },
  { id: 'p', label: '筒子 1〜9', tiles: nums('p', false) },
  { id: 'p0', label: '筒子 1〜9＋赤5', tiles: nums('p', true) },
  { id: 's', label: '索子 1〜9', tiles: nums('s', false) },
  { id: 's0', label: '索子 1〜9＋赤5', tiles: nums('s', true) },
  { id: 'z', label: '字牌 東〜中', tiles: ['1z', '2z', '3z', '4z', '5z', '6z', '7z'] },
  { id: 'wind', label: '風牌 東南西北', tiles: ['1z', '2z', '3z', '4z'] },
  { id: 'dragon', label: '三元牌 白發中', tiles: ['5z', '6z', '7z'] },
];

type Preview = { kind: string; rect: RelRect; cells: Array<{ code: TileCode; preview: string; feat: Uint8Array }> };

type Props = {
  tiles: Bank;
  onLearn: (tiles: Bank) => void;
};

/**
 * ゲームの牌一覧の画像から、行ごとにまとめて見本を覚える。
 * 行の種類を選んでその行を囲むと、並び順どおりに等分して牌を割り当てる。
 */
export function SheetLearner({ tiles, onLearn }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [img, setImg] = useState<Img | null>(null);
  const [kind, setKind] = useState(ROW_KINDS[0]!.id);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<Array<{ kind: string; rect: RelRect }>>([]);
  const [error, setError] = useState<string | null>(null);

  const open = async (file: File) => {
    try {
      const loaded = await loadImage(file);
      if (url) URL.revokeObjectURL(url);
      setUrl(loaded.url);
      setImg(loaded.img);
      setPreview(null);
      setDone([]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '画像を読み込めません');
    }
  };

  const onRect = (rect: RelRect) => {
    if (!img) return;
    const rowKind = ROW_KINDS.find((k) => k.id === kind)!;
    const region = crop(img, relToPx(rect, img));
    const n = rowKind.tiles.length;
    const cells = rowKind.tiles.map((code, i) => {
      const cell = crop(region, { x: (region.width * i) / n, y: 0, w: region.width / n, h: region.height });
      const tile = cropBrightRows(cell, { x0: 0, x1: cell.width });
      return { code, preview: toDataUrl(tile), feat: tileFeature(tile) };
    });
    setPreview({ kind, rect, cells });
  };

  const accept = () => {
    if (!preview) return;
    let next = tiles;
    for (const c of preview.cells) next = learn(next, c.code, c.feat);
    onLearn(next);
    setDone((d) => [...d, { kind: preview.kind, rect: preview.rect }]);
    setPreview(null);
    const idx = ROW_KINDS.findIndex((k) => k.id === preview.kind);
    const nextKind = ROW_KINDS.slice(idx + 1).find((k) => !done.some((d) => d.kind === k.id));
    if (nextKind) setKind(nextKind.id);
  };

  const rects: PickerRect[] = [
    ...done.map((d, i) => ({
      key: `done-${i}`,
      label: `${ROW_KINDS.find((k) => k.id === d.kind)!.label} ✓`,
      color: '#2f8a6a',
      rect: d.rect,
    })),
    ...(preview
      ? [{ key: 'preview', label: '確認中', color: '#d35400', rect: preview.rect, active: true }]
      : []),
  ];

  return (
    <div className="sheet-learner">
      <p className="hint">
        牌の一覧画像（ゲーム内の牌の説明画面など）があれば、全種類をまとめて覚えられます。
        行の種類を選んでから、その行の牌を端から端までぴったり囲んでください。
      </p>
      <label className="file-pick file-pick--small">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void open(f);
            e.target.value = '';
          }}
        />
        <strong>{url ? '別の一覧画像を選ぶ' : '牌一覧の画像を選ぶ'}</strong>
      </label>
      {error && <p className="error">{error}</p>}
      {url && (
        <>
          <div className="region-chips" role="group" aria-label="行の種類">
            {ROW_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className={`region-chip${kind === k.id ? ' is-on' : ''}${
                  done.some((d) => d.kind === k.id) ? ' is-set' : ''
                }`}
                style={{ ['--chip' as string]: '#1b4d3e' }}
                onClick={() => {
                  setKind(k.id);
                  setPreview(null);
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
          <RectPicker url={url} alt="牌一覧" rects={rects} drawing={!preview} onRect={onRect} />
          {preview && (
            <div className="sheet-preview">
              <div className="sheet-preview__row">
                {preview.cells.map((c, i) => (
                  <div key={i} className="sheet-preview__cell">
                    <img src={c.preview} alt="" />
                    <TileFace code={c.code} fluid />
                  </div>
                ))}
              </div>
              <p className="hint">上の切り出しと下の牌が同じなら「覚える」。ずれていたら囲み直してください。</p>
              <div className="btn-row btn-row--compact">
                <button type="button" className="btn btn-primary" onClick={accept}>
                  覚える
                </button>
                <button type="button" className="btn" onClick={() => setPreview(null)}>
                  囲み直す
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
