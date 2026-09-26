import { describe, expect, it } from 'vitest';
import {
  glyphFeature,
  makeImg,
  segmentGlyphs,
  segmentMelds,
  segmentTiles,
  tileFeature,
  type Img,
} from './imageTools';
import { classify, learn, prepareBank } from './templates';
import {
  estimateScores,
  inferMeld,
  parseRound,
  parseScore,
  parseSeat,
  scoreChars,
  scoresBySeat,
  sortedLabels,
  splitMelds,
} from './parse';

function fill(img: Img, x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const i = (yy * img.width + xx) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = 255;
    }
  }
}

const TABLE: [number, number, number] = [20, 70, 50];
const FACE: [number, number, number] = [245, 243, 235];
const INK: [number, number, number] = [30, 30, 30];

/** 卓の上に、幅 tw・高さ th の牌を並べる（gapAfter の位置で隙間を空ける） */
function handImage(count: number, tw: number, th: number, gapAfter?: number): Img {
  const width = count * tw + (gapAfter ? tw : 0) + 20;
  const img = makeImg(width, th + 10);
  fill(img, 0, 0, width, th + 10, TABLE);
  let x = 10;
  for (let i = 0; i < count; i++) {
    if (gapAfter && i === gapAfter) x += tw;
    fill(img, x, 5, tw - 1, th, FACE);
    fill(img, x + Math.round(tw * 0.3), 5 + Math.round(th * 0.3), Math.round(tw * 0.4), Math.round(th * 0.3), INK);
    x += tw;
  }
  return img;
}

describe('segmentTiles', () => {
  it('splits a hand into tiles using the tile width', () => {
    const img = handImage(13, 30, 40);
    const { spans } = segmentTiles(img, 30 / 50);
    expect(spans).toHaveLength(13);
  });

  it('keeps the separated drawn tile as its own tile', () => {
    const img = handImage(14, 30, 40, 13);
    const { spans } = segmentTiles(img, 30 / 50);
    expect(spans).toHaveLength(14);
    expect(spans[13]!.x0 - spans[12]!.x1).toBeGreaterThan(20);
  });

  it('honors a corrected tile count', () => {
    const img = handImage(13, 30, 40);
    const { spans, tileW } = segmentTiles(img, 0.3, 13);
    expect(spans).toHaveLength(13);
    expect(tileW).toBeGreaterThan(25);
  });
});

describe('segmentMelds', () => {
  it('finds upright and sideways tiles and splits groups at wide gaps', () => {
    const h = 40;
    const img = makeImg(220, h);
    fill(img, 0, 0, 220, h, TABLE);
    // ポン：縦・横・縦
    fill(img, 5, 0, 29, h, FACE);
    fill(img, 35, h - 30, 39, 30, FACE);
    fill(img, 75, 0, 29, h, FACE);
    // 次の組：縦3枚
    fill(img, 130, 0, 29, h, FACE);
    fill(img, 160, 0, 29, h, FACE);
    fill(img, 190, 0, 29, h, FACE);
    const groups = segmentMelds(img, 30 / 40);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.map((t) => t.rotated)).toEqual([false, true, false]);
    expect(groups[1]).toHaveLength(3);
  });
});

describe('segmentGlyphs', () => {
  it('splits digits on a dark background', () => {
    const img = makeImg(100, 30);
    fill(img, 0, 0, 100, 30, [10, 10, 10]);
    for (let i = 0; i < 5; i++) fill(img, 5 + i * 18, 5, 12, 20, [240, 240, 240]);
    const { boxes } = segmentGlyphs(img, false);
    expect(boxes).toHaveLength(5);
  });

  it('joins the two halves of a kanji only when asked', () => {
    const img = makeImg(60, 30);
    fill(img, 0, 0, 60, 30, [250, 250, 250]);
    fill(img, 10, 4, 8, 22, [20, 20, 20]);
    fill(img, 21, 4, 8, 22, [20, 20, 20]);
    expect(segmentGlyphs(img, false).boxes).toHaveLength(2);
    expect(segmentGlyphs(img, true).boxes).toHaveLength(1);
  });
});

describe('template matching', () => {
  it('recognizes a tile it has been taught and tells different tiles apart', () => {
    const a = handImage(1, 30, 40);
    const b = makeImg(a.width, a.height);
    fill(b, 0, 0, b.width, b.height, TABLE);
    fill(b, 10, 5, 29, 40, FACE);
    fill(b, 12, 8, 25, 6, INK);
    fill(b, 12, 36, 25, 6, INK);
    let bank = learn({}, '1m', tileFeature(a));
    bank = learn(bank, '2p', tileFeature(b));
    const prepared = prepareBank(bank);
    expect(classify(prepared, tileFeature(a)).label).toBe('1m');
    expect(classify(prepared, tileFeature(b)).label).toBe('2p');
    expect(classify(prepared, tileFeature(a)).score).toBeGreaterThan(0.99);
  });

  it('tells a blank tile from a lightly marked one', () => {
    const blank = makeImg(40, 50);
    fill(blank, 0, 0, 40, 50, FACE);
    const marked = makeImg(40, 50);
    fill(marked, 0, 0, 40, 50, FACE);
    fill(marked, 16, 10, 8, 30, [200, 30, 30]);
    const bank = prepareBank(learn(learn({}, '5z', tileFeature(blank)), '1m', tileFeature(marked)));
    const again = makeImg(40, 50);
    fill(again, 0, 0, 40, 50, [240, 238, 230]);
    expect(classify(bank, tileFeature(again)).label).toBe('5z');
    expect(classify(bank, tileFeature(marked)).label).toBe('1m');
  });

  it('matches glyphs regardless of size', () => {
    const big = makeImg(40, 40);
    fill(big, 0, 0, 40, 40, [0, 0, 0]);
    fill(big, 15, 5, 10, 30, [255, 255, 255]);
    const small = makeImg(20, 20);
    fill(small, 0, 0, 20, 20, [0, 0, 0]);
    fill(small, 8, 3, 5, 15, [255, 255, 255]);
    const fb = segmentGlyphs(big, false);
    const fs = segmentGlyphs(small, false);
    const bank = prepareBank(learn({}, '1', glyphFeature(fb.mask, 40, fb.boxes[0]!)));
    expect(classify(bank, glyphFeature(fs.mask, 20, fs.boxes[0]!)).score).toBeGreaterThan(0.9);
  });
});

describe('parsing read text', () => {
  it('reads round, hand number and honba', () => {
    expect(parseRound(['南', '3', '局', '2', '本'])).toEqual({ roundWind: '2z', handNumber: 3, honba: 2 });
    expect(parseSeat(['西'])).toBe('3z');
  });

  it('reads scores with units and signs', () => {
    expect(parseScore(['2', '5', ',', '0', '0', '0'], 1)).toBe(25000);
    expect(parseScore(['2', '5', '0'], 100)).toBe(25000);
    expect(parseScore(['-', '3', '0'], 100)).toBe(-3000);
    expect(scoreChars(25000, 100)).toEqual(['2', '5', '0']);
  });

  it('maps seat positions to winds', () => {
    expect(scoresBySeat('2z', { self: 1, right: 2, across: 3, left: 4 })).toEqual({
      south: 1,
      west: 2,
      north: 3,
      east: 4,
    });
    expect(scoresBySeat('1z', { self: 47000, right: 23000, left: 35000 }, 3)).toEqual({
      east: 47000,
      south: 23000,
      west: 35000,
      north: null,
    });
  });

  it('keeps a sorted hand in order when choosing labels', () => {
    const c = (entries: Array<[string, number]>) => new Map(entries);
    // 3番目の牌は 9s が僅差で1位だが、右隣が 7s なので理牌の順に合う 7s を選ぶ
    expect(
      sortedLabels([
        c([['3s', 0.9]]),
        c([['3s', 0.9]]),
        c([
          ['9s', 0.88],
          ['7s', 0.86],
        ]),
        c([['7s', 0.9]]),
      ]),
    ).toEqual(['3s', '3s', '7s', '7s']);
    // 赤五は五と同じ位置に並ぶ
    expect(sortedLabels([c([['4p', 0.9]]), c([['0p', 0.9]]), c([['5p', 0.9]]), c([['1z', 0.9]])])).toEqual([
      '4p',
      '0p',
      '5p',
      '1z',
    ]);
  });

  it('estimates unread scores from the table total', () => {
    const one = estimateScores({ self: 42200, right: 13700, across: 11200, left: null }, 4);
    expect(one.scores.left).toBe(32900);
    expect(one.estimated).toEqual(['left']);
    const two = estimateScores({ self: 23900, right: null, across: 23500, left: null }, 4);
    expect([two.scores.right, two.scores.left]).toEqual([26300, 26300]);
    const three = estimateScores({ self: null, right: null, across: null, left: 51800 }, 3);
    expect((three.scores.self ?? 0) + (three.scores.right ?? 0)).toBe(53200);
    expect(three.scores.across).toBeNull();
    expect(estimateScores({ self: null, right: null, across: null, left: null }, 4).estimated).toEqual([]);
    expect(estimateScores({ self: 90000, right: 90000, across: null, left: null }, 4).estimated).toEqual([]);
  });
});

describe('inferMeld', () => {
  it('builds pon, chi and kans from read tiles', () => {
    const pon = inferMeld([
      { label: '7z', rotated: false },
      { label: '7z', rotated: true },
      { label: '7z', rotated: false },
    ]);
    expect(pon.ok && [pon.meld.type, pon.meld.from]).toEqual(['pon', 'opposite']);
    const chi = inferMeld([
      { label: '3m', rotated: true },
      { label: '4m', rotated: false },
      { label: '5m', rotated: false },
    ]);
    expect(chi.ok && chi.meld.type).toBe('chi');
    const closed = inferMeld([
      { label: 'back', rotated: false },
      { label: '1z', rotated: false },
      { label: '1z', rotated: false },
      { label: 'back', rotated: false },
    ]);
    expect(closed.ok && closed.meld.type).toBe('closedKan');
    expect(inferMeld([{ label: '1m', rotated: false }, { label: null, rotated: false }]).ok).toBe(false);
  });

  it('splits melds that are lined up without gaps', () => {
    const cell = (label: string, rotated = false) => ({ label, rotated });
    const parts = splitMelds([
      cell('2s', true),
      cell('1s'),
      cell('3s'),
      cell('8p', true),
      cell('7p'),
      cell('9p'),
      cell('5z', true),
      cell('5z'),
      cell('5z'),
      cell('5z'),
    ]);
    expect(parts.map((p) => p.map((c) => c.label).join(' '))).toEqual(['2s 1s 3s', '8p 7p 9p', '5z 5z 5z 5z']);
  });
});
