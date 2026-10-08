import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { audit, checkPredictions, main, privateRoot, sheetCsv, snapshot } from './ocr-dataset.mjs';

// Artificial file-signature fixtures only. These are not game screenshots or accuracy data.
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'mj-ocr-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const samples = [];
  for (const id of ['a', 'b']) {
    const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from(id)]);
    await writeFile(path.join(root, `${id}.png`), bytes);
    samples.push({
      id, game: 'jantama', collection: 'new', imageKind: 'realScreenshot', imagePath: `${id}.png`,
      imageViewUrl: null, sha256: createHash('sha256').update(bytes).digest('hex'),
      source: { url: `https://example.invalid/${id}`, acquiredAt: '2026-10-08T00:00:00Z', position: 'test fixture only', sourceSequenceGroup: id, roundGroup: id, nearDuplicateGroup: id },
      permission: { status: 'documented', scope: 'privateAnalysis', basis: 'test fixture', evidence: 'artificial test fixture' },
      split: id === 'a' ? 'tune' : 'holdout',
      review: { status: 'verified', independentOfPrediction: true, reviewer: 'test', reviewedAt: '2026-10-08T00:00:00Z', evidence: 'test only' },
      dedupReview: { status: 'verified', reviewer: 'test', reviewedAt: '2026-10-08T00:00:00Z', existingInventory: 'test inventory', evidence: 'test only' },
      groundTruth: { hand: ['1m'], dora: [], melds: [] },
    });
  }
  return { root, manifest: { schemaVersion: 1, datasetId: 'test-only', samples } };
}

test('verified vs pending counts; pending can never be usable training truth', async (t) => {
  const { root, manifest } = await fixture(t);
  assert.deepEqual(await audit(root, manifest), { total: 2, pending: 0, verifiedNewReal: 2, tune: 1, holdout: 1, synthetic: 0 });
  const s = manifest.samples[1];
  s.review.status = 'pending';
  await assert.rejects(audit(root, manifest), /pending\/rejected/);
  s.groundTruth = null; s.split = null;
  assert.equal((await audit(root, manifest)).verifiedNewReal, 1);
});

test('actual files, hash, permissions and dedup evidence must exist', async (t) => {
  const { root, manifest } = await fixture(t);
  for (const [change, error] of [
    [(s) => { s.imagePath = 'missing.png'; }, /ENOENT/],
    [(s) => { s.sha256 = '0'.repeat(64); }, /hash mismatch/],
    [(s) => { s.permission.status = 'unknown'; }, /source use scope/],
    [(s) => { s.review.independentOfPrediction = false; }, /independent review/],
    [(s) => { s.dedupReview.existingInventory = ''; }, /dedup review/],
    [(s) => { s.source.acquiredAt = 'yesterday'; }, /timestamp/],
  ]) {
    const copy = structuredClone(manifest); change(copy.samples[0]);
    await assert.rejects(audit(root, copy), error);
  }
});

test('reject exact duplicates, adjacent frames, and cross-split source/round leakage', async (t) => {
  const { root, manifest } = await fixture(t);
  for (const [change, error] of [
    [(s, a) => { s.sha256 = a.sha256; s.imagePath = a.imagePath; }, /exact duplicate/],
    [(s, a) => { s.source.nearDuplicateGroup = a.source.nearDuplicateGroup; }, /near-duplicate/],
    [(s, a) => { s.source.sourceSequenceGroup = a.source.sourceSequenceGroup; }, /split leakage/],
    [(s, a) => { s.source.roundGroup = a.source.roundGroup; }, /split leakage/],
  ]) {
    const copy = structuredClone(manifest); change(copy.samples[1], copy.samples[0]);
    await assert.rejects(audit(root, copy), error);
  }
});

test('synthetic/existing samples never enter new real holdout or new count', async (t) => {
  const { root, manifest } = await fixture(t);
  manifest.samples[1].imageKind = 'synthetic';
  await assert.rejects(audit(root, manifest), /synthetic image/);
  manifest.samples[1].split = 'tune';
  assert.equal((await audit(root, manifest)).verifiedNewReal, 1);
  manifest.samples[1].imageKind = 'realScreenshot'; manifest.samples[1].collection = 'existing'; manifest.samples[1].split = 'holdout';
  await assert.rejects(audit(root, manifest), /unknown training history/);
});

test('kan types, red tiles, tile counts, supply, called positions and orientations', async (t) => {
  const { root, manifest } = await fixture(t);
  const truth = manifest.samples[0].groundTruth;
  truth.melds = [{ type: 'addedKan', tiles: ['5p', '0p', '5p', '5p'], from: 'opposite', calledIndex: 1, addedIndex: 3, turns: [0, 90, 0, 90] }];
  await audit(root, manifest);
  for (const [change, error] of [
    [(s) => { s.groundTruth.melds[0].tiles.pop(); }, /tile count/],
    [(s) => { s.groundTruth.melds[0].addedIndex = 1; }, /distinct added/],
    [(s) => { s.groundTruth.melds[0].turns = []; }, /orientation/],
    [(s) => { s.groundTruth.melds[0].tiles[0] = '0p'; }, /duplicate red/],
    [(s) => { s.groundTruth.hand = ['5p']; }, /more than four/],
    [(s) => { s.groundTruth.melds[0].tiles[0] = '6p'; }, /unequal/],
  ]) {
    const copy = structuredClone(manifest); change(copy.samples[0]);
    await assert.rejects(audit(root, copy), error);
  }
});

test('freeze detects changed labels and cannot be overwritten; 100 cannot be claimed', async (t) => {
  const { root, manifest } = await fixture(t);
  const file = path.join(root, 'manifest.json');
  await writeFile(file, JSON.stringify(manifest));
  const args = ['--data-root', root];
  await assert.rejects(main(['validate', ...args, '--require-new', '100']), /found 2/);
  await main(['freeze', ...args]);
  await main(['check-freeze', ...args]);
  await assert.rejects(main(['freeze', ...args]), /EEXIST/);
  const old = snapshot(manifest);
  manifest.samples[0].groundTruth.hand = ['2m'];
  assert.notEqual(snapshot(manifest).manifestSha256, old.manifestSha256);
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(main(['check-freeze', ...args]), /Frozen dataset changed/);
});

test('private root, input and output cannot escape via symlinks or paths', async (t) => {
  const { root, manifest } = await fixture(t);
  await assert.rejects(privateRoot(path.resolve('public')), /outside the repository/);
  await assert.rejects(privateRoot(path.resolve('..')), /not its ancestor/);
  await symlink(path.resolve('package.json'), path.join(root, 'escape.png'));
  manifest.samples[0].imagePath = 'escape.png';
  await assert.rejects(audit(root, manifest), /escapes/);
  manifest.samples[0].imagePath = 'a.png';
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(main(['export', '--data-root', root, '--output', '../escaped.csv']), /escapes/);
  await symlink(path.resolve('public'), path.join(root, 'elsewhere'));
  await assert.rejects(main(['export', '--data-root', root, '--output', 'elsewhere/escaped.csv']), /escapes/);
});

test('prediction errors remain raw; truth is separate; CSV escapes formulae and quotes', async (t) => {
  const { root, manifest } = await fixture(t);
  const p = { sampleId: 'a', imageSha256: manifest.samples[0].sha256, engine: '=untrusted()', codeRevision: 'test-rev', modelSha256: '0'.repeat(64), predictedAt: '2026-10-08T00:00:00Z', localBank: 'empty', status: 'ok', rawOutput: { hand: ['bad-tile'], note: 'quote"\nline' } };
  const runs = { schemaVersion: 1, datasetId: manifest.datasetId, predictions: [p] };
  const predictions = checkPredictions(manifest, runs);
  const csv = sheetCsv(manifest, predictions);
  assert.ok(csv.includes("'=")); assert.ok(csv.includes('bad-tile')); assert.ok(csv.includes('""1m""'));
  const changed = structuredClone(runs); changed.predictions[0].imageSha256 = 'f'.repeat(64);
  assert.throws(() => checkPredictions(manifest, changed), /provenance/);
  changed.predictions[0].imageSha256 = p.imageSha256; changed.predictions[0].localBank = 'user-trained';
  assert.throws(() => checkPredictions(manifest, changed), /clean local bank/);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(root, 'predictions.json'), JSON.stringify(runs));
  await main(['export', '--data-root', root, '--predictions', 'predictions.json']);
  assert.equal(await readFile(path.join(root, 'review.csv'), 'utf8'), csv);
});
