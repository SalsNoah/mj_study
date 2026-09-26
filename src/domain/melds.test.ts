import { describe, expect, it } from 'vitest';
import { buildMeldFromTile } from './melds';

describe('buildMeldFromTile', () => {
  it('builds a chi starting from the tapped tile, called from the left', () => {
    const r = buildMeldFromTile('chi', '3m', 'right');
    expect(r.ok && r.meld.tiles).toEqual(['3m', '4m', '5m']);
    expect(r.ok && r.meld.from).toBe('left');
  });

  it('rejects chi that would run past 9 or use honors', () => {
    expect(buildMeldFromTile('chi', '8m', 'left').ok).toBe(false);
    expect(buildMeldFromTile('chi', '1z', 'left').ok).toBe(false);
  });

  it('keeps a single red five in pon and kan', () => {
    const pon = buildMeldFromTile('pon', '0p', 'opposite');
    expect(pon.ok && pon.meld.tiles).toEqual(['0p', '5p', '5p']);
    expect(pon.ok && pon.meld.calledIndex).toBe(1);
    const kan = buildMeldFromTile('openKan', '0s', 'right');
    expect(kan.ok && kan.meld.tiles).toEqual(['0s', '5s', '5s', '5s']);
    expect(kan.ok && kan.meld.calledIndex).toBe(3);
  });

  it('builds closed and added kans', () => {
    const closed = buildMeldFromTile('closedKan', '1z', 'left');
    expect(closed.ok && closed.meld.from).toBeNull();
    const added = buildMeldFromTile('addedKan', '7z', 'right');
    expect(added.ok && [added.meld.calledIndex, added.meld.addedIndex]).toEqual([2, 2]);
  });
});
