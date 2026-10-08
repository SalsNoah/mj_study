import { describe, expect, it } from 'vitest';
import { columnMeldEvidence, type MeldEvidence } from './meldEvidence';
import { confirmOpenKan, inferMeld, splitMelds, supportedHandCount, type MeldCell } from './parse';

const cell = (label: string | null, rotated = false, stack: MeldEvidence['stack'] = 'none'): MeldCell & { sure: boolean } => ({
  label, rotated, sure: true,
  meldEvidence: { source: 'manualConfirmation', face: label === 'back' ? 'back' : 'front', orientation: rotated ? 'sideways' : 'upright', stack },
});
const pon = (label: string) => [cell(label, true), cell(label), cell(label)];
const added = (called: number) => {
  const base = [cell('5p'), cell('5p'), cell('5p')];
  base[called] = cell('5p', true, { pairId: 'image-region:1', level: 'lower' });
  base.splice(called + 1, 0, cell('0p', true, { pairId: 'image-region:1', level: 'upper' }));
  return base;
};

describe('kan evidence (artificial fixtures, not screenshot accuracy)', () => {
  it.each([0, 1, 2])('retains red added tile and original pon order/from at position %i', (called) => {
    const r = inferMeld(added(called));
    expect(r.ok && r.meld).toMatchObject({ type: 'addedKan', tiles: ['5p', '5p', '5p', '0p'], from: ['left', 'opposite', 'right'][called], calledIndex: called, addedIndex: called });
  });
  it('keeps a red called tile distinct from a normal added tile', () => {
    const cells = added(1); cells[1]!.label = '0p'; cells[2]!.label = '5p';
    expect(inferMeld(cells)).toMatchObject({ ok: true, meld: { tiles: ['5p', '0p', '5p', '5p'] } });
  });
  it.each([0, 1, 3])('accepts an observed unstacked open kan, called position %i', (i) => {
    const cells = Array.from({ length: 4 }, (_, j) => cell('1z', i === j));
    expect(inferMeld(cells)).toMatchObject({ ok: true, meld: { type: 'openKan', calledIndex: i } });
  });
  it.each([0, 1, 2])('does not treat %i sideways tiles as sufficient kan evidence', (n) => {
    const cells = Array.from({ length: 4 }, (_, i) => ({ label: '1z', rotated: i < n }));
    expect(inferMeld(cells).ok).toBe(false);
  });
  it('keeps unknown stack distinct from observed no-stack in current detector output', () => {
    expect(columnMeldEvidence(true)).toEqual({ source: 'columnDetector', face: 'unknown', orientation: 'sideways', stack: 'unknown' });
    const cells = Array.from({ length: 4 }, (_, i) => ({ ...cell('1z', i === 0), meldEvidence: columnMeldEvidence(i === 0) }));
    expect(inferMeld(cells).ok).toBe(false);
  });
  it.each(['pair', 'upper', 'orientation', 'other-stack', 'unknown-face', 'different-tile', 'extra-red'] as const)('rejects incomplete/contradictory added-kan evidence: %s', (kind) => {
    const cells = added(1);
    if (kind === 'pair') cells[2]!.meldEvidence!.stack = { pairId: 'different', level: 'upper' };
    if (kind === 'upper') cells.splice(2, 1);
    if (kind === 'orientation') cells[2]!.rotated = false;
    if (kind === 'other-stack') cells[0]!.meldEvidence!.stack = 'unknown';
    if (kind === 'unknown-face') cells[0]!.meldEvidence!.face = 'unknown';
    if (kind === 'different-tile') cells[0]!.label = '6p';
    if (kind === 'extra-red') cells[0]!.label = '0p';
    expect(inferMeld(cells).ok).toBe(false);
  });
  it('requires two matching visible middle tiles for a closed kan', () => {
    const cells = [cell('back'), cell('1z'), cell('1z'), cell('back')];
    expect(inferMeld(cells)).toMatchObject({ ok: true, meld: { type: 'closedKan', tiles: ['1z', '1z', '1z', '1z'] } });
    cells[1]!.label = null; expect(inferMeld(cells).ok).toBe(false);
    cells[1]!.label = '2z'; expect(inferMeld(cells).ok).toBe(false);
  });
  it('does not invent hidden red identity or ignore contradictory back evidence', () => {
    const cells = [cell('back'), cell('5p'), cell('5p'), cell('back')];
    expect(inferMeld(cells).ok).toBe(false);
    cells[1]!.label = '0p';
    expect(inferMeld(cells)).toMatchObject({ ok: true, meld: { tiles: ['5p', '0p', '5p', '5p'] } });
    cells[0]!.meldEvidence!.face = 'front'; expect(inferMeld(cells).ok).toBe(false);
  });
  it('preserves stack identity while splitting several melds and rejects an orphan after removal', () => {
    const kan = added(1);
    const parts = splitMelds([...pon('1z'), ...kan, ...pon('2z')]);
    expect(parts.map((p) => p.length)).toEqual([3, 4, 3]);
    expect(inferMeld(parts[1]!)).toMatchObject({ ok: true, meld: { type: 'addedKan' } });
    expect(parts[1]![1]).toBe(kan[1]);
    expect(inferMeld(kan.filter((_, i) => i !== 2)).ok).toBe(false);
  });
  it('records explicit open-kan confirmation without fabricating stacked or unknown tiles', () => {
    const cells = Array.from({ length: 4 }, (_, i) => ({ ...cell('1z', i === 0), meldEvidence: columnMeldEvidence(i === 0) }));
    const confirmed = confirmOpenKan(cells)!;
    expect(confirmed[0]!.meldEvidence.source).toBe('manualConfirmation');
    expect(cells[0]!.meldEvidence.stack).toBe('unknown');
    expect(inferMeld(confirmed)).toMatchObject({ ok: true, meld: { type: 'openKan' } });
    expect(confirmOpenKan(added(1))).toBeNull();
    cells[1]!.label = null; expect(confirmOpenKan(cells)).toBeNull();
  });
});

describe('limited short-hand rescue', () => {
  const melds = () => ['1z', '2z', '3z', '4z'].map(pon);
  it.each([1, 2])('accepts %i confident concealed tiles plus four complete melds', (n) => {
    expect(supportedHandCount(Array.from({ length: n }, () => cell('9s')), melds())).toBe(true);
  });
  it('rejects three tiles, absent/fifth meld, uncertain tiles and missing call direction', () => {
    expect(supportedHandCount([cell('9s'), cell('9s'), cell('8s')], melds())).toBe(false);
    expect(supportedHandCount([cell('9s')], melds().slice(1))).toBe(false);
    expect(supportedHandCount([cell('9s')], [...melds(), pon('5z')])).toBe(false);
    expect(supportedHandCount([{ ...cell('9s'), sure: false }], melds())).toBe(false);
    const m = melds(); m[0]![0]!.sure = false;
    expect(supportedHandCount([cell('9s')], m)).toBe(false);
    const noCall = melds(); noCall[0] = [cell('1z'), cell('1z'), cell('1z')];
    expect(supportedHandCount([cell('9s')], noCall)).toBe(false);
    const twoCalls = melds(); twoCalls[0] = [cell('1z', true), cell('1z', true), cell('1z')];
    expect(supportedHandCount([cell('9s')], twoCalls)).toBe(false);
  });
  it('rejects impossible supply or ambiguous kan and preserves ordinary hand counts', () => {
    expect(supportedHandCount([cell('1z'), cell('1z')], melds())).toBe(false);
    const m = melds(); m[0] = Array.from({ length: 4 }, () => cell('1z'));
    expect(supportedHandCount([cell('9s')], m)).toBe(false);
    expect(supportedHandCount([], melds())).toBe(false);
    expect(supportedHandCount(Array.from({ length: 4 }, () => cell('9s')), [])).toBe(true);
    expect(supportedHandCount(Array.from({ length: 15 }, () => cell('9s')), [])).toBe(false);
  });
});
