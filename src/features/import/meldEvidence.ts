/** Image evidence, separate from a tile label/confidence. Missing evidence is unknown. */
export type MeldEvidence = {
  source: 'columnDetector' | 'manualConfirmation';
  face: 'front' | 'back' | 'unknown';
  orientation: 'upright' | 'sideways' | 'unknown';
  /** Pair IDs belong to one detected image region, never to an array index. */
  stack: 'unknown' | 'none' | { pairId: string; level: 'lower' | 'upper' };
};

/** The current column detector observes orientation, but not backs or stacked tiles. */
export function columnMeldEvidence(rotated: boolean): MeldEvidence {
  return { source: 'columnDetector', face: 'unknown', orientation: rotated ? 'sideways' : 'upright', stack: 'unknown' };
}
