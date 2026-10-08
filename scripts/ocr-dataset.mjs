/** Offline private OCR dataset audit. No upload, collection, labelling or training. */
import { createHash } from 'node:crypto';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TILE = /^(?:[0-9][mps]|[1-7]z)$/;
const SHA = /^[a-f0-9]{64}$/;
const TYPES = new Set(['chi', 'pon', 'closedKan', 'openKan', 'addedKan']);
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const inside = (root, target) => target !== root && !path.relative(root, target).startsWith(`..${path.sep}`) && path.relative(root, target) !== '..' && !path.isAbsolute(path.relative(root, target));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
const digest = (v) => hash(JSON.stringify(canonical(v)));
const date = (v) => text(v) && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
const url = (v) => { try { return ['https:', 'http:'].includes(new URL(v).protocol); } catch { return false; } };

function need(ok, message) { if (!ok) throw new Error(message); }

export async function privateRoot(value) {
  need(text(value), '--data-root is required');
  const root = await realpath(value);
  const repo = await realpath(REPO);
  const allowed = path.join(repo, 'samples-local');
  need(root !== repo && !inside(root, repo) && (!inside(repo, root) || root === allowed || inside(allowed, root)), 'Data must be outside the repository (not its ancestor) or in ignored samples-local/');
  need((await stat(root)).isDirectory(), 'Data root must be a directory');
  return root;
}

async function existing(root, relative) {
  need(text(relative) && !path.isAbsolute(relative), 'File paths must be relative to the private data root');
  const target = await realpath(path.resolve(root, relative));
  need(inside(root, target), `File escapes private data root: ${relative}`);
  need((await stat(target)).isFile(), `Not a file: ${relative}`);
  return target;
}

async function json(root, relative) { return JSON.parse(await readFile(await existing(root, relative), 'utf8')); }

// New outputs only: never overwrite a frozen split, predictions, or prior evidence.
async function output(root, relative, data) {
  need(text(relative) && !path.isAbsolute(relative), 'Output must be relative to the private data root');
  const dest = path.resolve(root, relative);
  const parent = await realpath(path.dirname(dest));
  need(inside(root, dest) && (parent === root || inside(root, parent)), 'Output escapes private data root');
  await writeFile(dest, data, { flag: 'wx', mode: 0o600 });
}

function labels(value, where) {
  need(value && typeof value === 'object', `${where}: labels required`);
  for (const field of ['hand', 'dora']) need(Array.isArray(value[field]) && value[field].every((t) => typeof t === 'string' && TILE.test(t)), `${where}: invalid ${field}`);
  need(value.hand.length >= 1 && value.hand.length <= 14 && value.dora.length <= 5, `${where}: invalid hand/dora count`);
  need(Array.isArray(value.melds) && value.melds.length <= 4, `${where}: invalid melds`);
  const supply = new Map();
  const red = new Set();
  const normalize = (t) => t[0] === '0' ? `5${t[1]}` : t;
  for (const m of value.melds) {
    need(m && TYPES.has(m.type), `${where}: invalid meld type`);
    need(Array.isArray(m.tiles) && m.tiles.every((t) => typeof t === 'string' && TILE.test(t)), `${where}: invalid meld tiles`);
    need(m.tiles.length === (m.type === 'chi' || m.type === 'pon' ? 3 : 4), `${where}: invalid meld tile count`);
    need(Array.isArray(m.turns) && m.turns.length === m.tiles.length && m.turns.every((n) => [0, 90, 180, 270].includes(n)), `${where}: record each tile orientation`);
    need(['left', 'opposite', 'right', null].includes(m.from), `${where}: invalid called-from direction`);
    if (m.type === 'closedKan') {
      need(m.from === null && m.calledIndex === null && m.addedIndex === null, `${where}: closed kan cannot have a called tile`);
    } else {
      need(m.from !== null && Number.isInteger(m.calledIndex) && m.calledIndex >= 0 && m.calledIndex < m.tiles.length, `${where}: called tile required`);
      if (m.type === 'addedKan') need(Number.isInteger(m.addedIndex) && m.addedIndex >= 0 && m.addedIndex < 4 && m.addedIndex !== m.calledIndex, `${where}: distinct added tile required`);
      else need(m.addedIndex === null, `${where}: unexpected added tile`);
    }
    if (m.type === 'chi') {
      const ts = m.tiles.map(normalize).sort();
      need(m.from === 'left' && ts[0][1] !== 'z' && ts.every((t) => t[1] === ts[0][1]) && Number(ts[1][0]) === Number(ts[0][0]) + 1 && Number(ts[2][0]) === Number(ts[0][0]) + 2, `${where}: invalid chi`);
    } else need(m.tiles.every((t) => normalize(t) === normalize(m.tiles[0])), `${where}: unequal pon/kan tiles`);
  }
  need(value.hand.length + value.melds.length * 3 <= 14, `${where}: hand too large for meld count`);
  for (const t of [...value.hand, ...value.dora, ...value.melds.flatMap((m) => m.tiles)]) {
    const n = normalize(t);
    supply.set(n, (supply.get(n) ?? 0) + 1);
    need(supply.get(n) <= 4, `${where}: more than four ${n}`);
    if (t[0] === '0') { need(!red.has(t), `${where}: duplicate red ${t}`); red.add(t); }
  }
}

/** Validate actual files and eligibility. Pending samples are visible but never trainable. */
export async function audit(root, manifest) {
  need(manifest?.schemaVersion === 1 && Array.isArray(manifest.samples), 'Expected schemaVersion 1 and samples array');
  need(text(manifest.datasetId), 'datasetId required');
  const ids = new Set();
  const hashes = new Set();
  const groups = new Map();
  const duplicateGroups = new Set();
  const counts = { total: 0, pending: 0, verifiedNewReal: 0, tune: 0, holdout: 0, synthetic: 0 };
  for (const s of manifest.samples) {
    need(s && text(s.id) && !ids.has(s.id), 'Missing/duplicate sample ID'); ids.add(s.id);
    const at = s.id;
    need(['new', 'existing'].includes(s.collection), `${at}: invalid collection`);
    need(['realScreenshot', 'synthetic'].includes(s.imageKind), `${at}: imageKind required`);
    need(s.game === 'jantama', `${at}: this collection is jantama only`);
    need(SHA.test(s.sha256), `${at}: sha256 required`);
    need(!hashes.has(s.sha256), `${at}: exact duplicate image`); hashes.add(s.sha256);
    const bytes = await readFile(await existing(root, s.imagePath));
    need(hash(bytes) === s.sha256, `${at}: image hash mismatch`);
    // This is only a file signature check; visual review remains mandatory.
    need(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) || (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'), `${at}: expected PNG/JPEG/WebP file`);
    need(s.source && url(s.source.url) && date(s.source.acquiredAt) && text(s.source.position), `${at}: source URL, timestamp and replay/video position required`);
    for (const key of ['sourceSequenceGroup', 'roundGroup', 'nearDuplicateGroup']) need(text(s.source[key]), `${at}: ${key} required`);
    need(!duplicateGroups.has(s.source.nearDuplicateGroup), `${at}: near-duplicate/adjacent frame group already included`);
    duplicateGroups.add(s.source.nearDuplicateGroup);
    need(s.permission?.status === 'documented' && ['privateAnalysis', 'modelDistribution'].includes(s.permission.scope) && text(s.permission.basis) && text(s.permission.evidence), `${at}: source use scope and basis must be documented`);
    need(s.split === null || ['tune', 'holdout'].includes(s.split), `${at}: invalid split`);
    need(['pending', 'verified', 'rejected'].includes(s.review?.status), `${at}: invalid review status`);
    need(s.imageViewUrl === null || url(s.imageViewUrl), `${at}: imageViewUrl must be a private existing HTTP(S) link or null`);
    if (s.review.status === 'verified') {
      need(s.review.independentOfPrediction === true && text(s.review.reviewer) && date(s.review.reviewedAt) && text(s.review.evidence), `${at}: independent review evidence required`);
      need(s.dedupReview?.status === 'verified' && text(s.dedupReview.reviewer) && date(s.dedupReview.reviewedAt) && text(s.dedupReview.existingInventory) && text(s.dedupReview.evidence), `${at}: dedup review against existing inventory required`);
      labels(s.groundTruth, at);
      need(s.split !== null, `${at}: verified sample needs split`);
      need(s.imageKind === 'realScreenshot' || s.split !== 'holdout', `${at}: synthetic image cannot enter real screenshot holdout`);
      if (s.collection === 'existing') need(s.split !== 'holdout', `${at}: existing images with unknown training history cannot enter new holdout`);
      if (s.collection === 'new' && s.imageKind === 'realScreenshot') counts.verifiedNewReal++;
      counts[s.split]++;
    } else {
      need(s.groundTruth === null && s.split === null, `${at}: pending/rejected sample cannot have usable ground truth or split`);
      counts.pending++;
    }
    for (const key of ['sourceSequenceGroup', 'roundGroup']) {
      const group = `${key}:${s.source[key]}`;
      if (s.split !== null) {
        need(!groups.has(group) || groups.get(group) === s.split, `${at}: split leakage in ${key}`);
        groups.set(group, s.split);
      }
    }
    if (s.imageKind === 'synthetic') counts.synthetic++;
    counts.total++;
  }
  return counts;
}

export function snapshot(manifest) {
  // Freeze every sample, split and review; later changes need a new dataset version.
  return { schemaVersion: 1, datasetId: manifest.datasetId, manifestSha256: digest(manifest), holdoutIds: manifest.samples.filter((s) => s.split === 'holdout').map((s) => s.id).sort() };
}

export function checkPredictions(manifest, runs) {
  need(runs?.schemaVersion === 1 && runs.datasetId === manifest.datasetId && Array.isArray(runs.predictions), 'Invalid predictions file/dataset');
  const samples = new Map(manifest.samples.map((s) => [s.id, s]));
  const seen = new Set();
  for (const p of runs.predictions) {
    const s = samples.get(p.sampleId);
    need(s && !seen.has(p.sampleId), 'Unknown/duplicate prediction sample ID'); seen.add(p.sampleId);
    need(p.imageSha256 === s.sha256 && text(p.engine) && text(p.codeRevision) && SHA.test(p.modelSha256) && date(p.predictedAt), `${p.sampleId}: prediction provenance required`);
    need(p.localBank === 'empty', `${p.sampleId}: use a clean local bank for reproducibility`);
    need(['ok', 'failed'].includes(p.status) && (p.status === 'ok' ? p.rawOutput !== null && typeof p.rawOutput === 'object' : text(p.failure)), `${p.sampleId}: raw prediction or failure required`);
    // Intentionally do not coerce/validate prediction tiles as ground truth: errors must remain visible.
  }
  return new Map(runs.predictions.map((p) => [p.sampleId, p]));
}

const csvCell = (v) => {
  let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // CSV imports must not execute user-controlled URLs, source titles or predictions as formulae.
  if (/^[\s\uFEFF]*[=+@-]/u.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
};

export function sheetCsv(manifest, predictions = new Map()) {
  const columns = ['id', 'collection', 'image_kind', 'image_link', 'image_path', 'sha256', 'source_url', 'acquired_at', 'source_position', 'source_sequence_group', 'round_group', 'near_duplicate_group', 'permission_scope', 'permission_basis', 'permission_evidence', 'split', 'review_status', 'reviewer', 'reviewed_at', 'review_evidence', 'dedup_review', 'prediction_engine', 'prediction_code_revision', 'prediction_model_sha256', 'predicted_at', 'prediction_status', 'prediction_raw', 'prediction_failure', 'ground_truth', 'meld_types', 'meld_count', 'multiple_melds', 'orientations', 'called_from', 'error_type', 'error_tile_count', 'error_tile_kind', 'error_red', 'error_order', 'user_comment'];
  const rows = manifest.samples.map((s) => {
    const p = predictions.get(s.id);
    const melds = s.groundTruth?.melds;
    return [s.id, s.collection, s.imageKind, s.imageViewUrl, s.imagePath, s.sha256, s.source.url, s.source.acquiredAt, s.source.position, s.source.sourceSequenceGroup, s.source.roundGroup, s.source.nearDuplicateGroup, s.permission.scope, s.permission.basis, s.permission.evidence, s.split, s.review.status, s.review.reviewer, s.review.reviewedAt, s.review.evidence, s.dedupReview, p?.engine, p?.codeRevision, p?.modelSha256, p?.predictedAt, p?.status, p?.rawOutput, p?.failure, s.groundTruth, melds?.map((m) => m.type), melds?.length, melds ? melds.length > 1 : null, melds?.map((m) => m.turns), melds?.map((m) => m.from), '', '', '', '', '', ''];
  });
  return '\uFEFF' + [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export async function main(argv) {
  const [command, ...rest] = argv;
  need(['validate', 'freeze', 'check-freeze', 'export'].includes(command), 'Usage: node scripts/ocr-dataset.mjs validate|freeze|check-freeze|export --data-root PATH [--manifest manifest.json] [--require-new 100] [--predictions predictions.json] [--output review.csv] [--lock holdout-lock.json]');
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    need(['--data-root', '--manifest', '--require-new', '--predictions', '--output', '--lock'].includes(rest[i]) && text(rest[i + 1]) && !rest[i + 1].startsWith('--') && !(rest[i] in opts), `Invalid/duplicate option: ${rest[i]}`);
    opts[rest[i]] = rest[i + 1];
  }
  const root = await privateRoot(opts['--data-root']);
  const manifest = await json(root, opts['--manifest'] ?? 'manifest.json');
  const counts = await audit(root, manifest);
  if (opts['--require-new'] !== undefined) {
    need(/^[1-9]\d*$/.test(opts['--require-new']), '--require-new must be a positive integer');
    need(counts.verifiedNewReal === Number(opts['--require-new']), `Expected exactly ${opts['--require-new']} verified new real screenshots; found ${counts.verifiedNewReal}`);
  }
  if (command === 'freeze') {
    need(counts.holdout > 0 && counts.tune > 0 && counts.pending === 0, 'Freeze requires verified tuning and holdout samples, with no pending/rejected rows');
    await output(root, opts['--lock'] ?? 'holdout-lock.json', JSON.stringify(snapshot(manifest), null, 2) + '\n');
  }
  if (command === 'check-freeze') need(digest(await json(root, opts['--lock'] ?? 'holdout-lock.json')) === digest(snapshot(manifest)), 'Frozen dataset changed; do not compare runs as the same holdout');
  if (command === 'export') {
    const predictions = opts['--predictions'] ? checkPredictions(manifest, await json(root, opts['--predictions'])) : new Map();
    await output(root, opts['--output'] ?? 'review.csv', sheetCsv(manifest, predictions));
  }
  console.log(JSON.stringify({ command, ...counts, warning: 'Metadata checks do not prove visual accuracy, permissions, or independent review. No images uploaded; no training or accuracy evaluation performed.' }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
