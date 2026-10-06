import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { materialBadgeStatus } from '@/domain/materialRecords';
import { countMaterialStudies, materialSourceIds, materialStudySourceIds } from '@/domain/materials';
import { buildRecordSeries, RECORD_PERIODS } from '@/domain/recordSeries';
import { emptyStore, type LearningMaterial, type Store } from '@/domain/types';
import { materialFingerprint } from '@/features/materials/materialPresentation';
import { LocalStorageRepository, type SaveResult } from './repository';

const KEY = 'material-archive-test:v1';
const NOW = '2026-10-06T10:00:00.000Z';
let data: Map<string, string>;
let repo: LocalStorageRepository;
const material = (extra: Partial<LearningMaterial> = {}): LearningMaterial => ({ id: 'material', title: '教材',
  url: 'https://example.com/lesson', comment: '保存したメモ', createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z', ...extra });
function fixture(): Store {
  return { ...emptyStore(), materials: [material()], materialStudyEvents: Array.from({ length: 5 }, (_, i) => ({
    id: `event-${i}`, materialId: 'material', at: `2026-10-0${i + 1}T00:00:00.000Z`,
    title: `記録時のタイトル${i}`, url: 'https://example.com/original', comment: `記録時のコメント${i}`,
  })) };
}
function load(): Store {
  const result = repo.load();
  if (!result.ok) throw new Error(result.reason);
  return result.store;
}
function saved(result: SaveResult): Store {
  expect(result.ok, result.ok ? '' : result.reason).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.store;
}
function totals(store: Store) {
  const count = countMaterialStudies(store.materialStudyEvents);
  return { count, badge: materialBadgeStatus(count), series: RECORD_PERIODS.map(({ value }) =>
    buildRecordSeries(store.daily, value, new Date(NOW), store.materialStudyEvents)) };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(NOW));
  data = new Map([[KEY, JSON.stringify(fixture())]]);
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
  });
  repo = new LocalStorageRepository(KEY);
});
afterEach(() => { repo.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('reversible material archive', () => {
  it('archives, reloads and restores exact identities, notes, histories, counts, charts and badges', () => {
    const original = load();
    const snapshot = structuredClone(original);
    const sources = original.materials!.map(materialSourceIds);
    const eventSources = original.materialStudyEvents!.map(materialStudySourceIds);
    const archived = saved(repo.setMaterialArchived(original, 'material', true));
    expect(archived.materials![0]).toEqual({ ...original.materials![0], archivedAt: NOW, updatedAt: NOW });
    expect(archived.materialStudyEvents).toEqual(original.materialStudyEvents);
    expect(archived.materials!.map(materialSourceIds)).toEqual(sources);
    expect(archived.materialStudyEvents!.map(materialStudySourceIds)).toEqual(eventSources);
    expect(totals(archived)).toEqual(totals(original));
    expect(load()).toEqual(archived);
    const restored = saved(repo.setMaterialArchived(load(), 'material', false));
    expect(restored.materials![0]).toEqual({ ...original.materials![0], updatedAt: NOW });
    expect(restored.materialStudyEvents).toEqual(original.materialStudyEvents);
    expect(totals(restored)).toEqual(totals(original));
    expect(load()).toEqual(restored);
    expect(original).toEqual(snapshot);
    const { revision: _revision, materials: _materials, ...other } = original;
    expect(restored).toMatchObject(other);
  });

  it('has no extra write for repeated archive or restore, and rejects unknown IDs', () => {
    let store = load();
    expect(saved(repo.setMaterialArchived(store, 'material', false))).toBe(store);
    store = saved(repo.setMaterialArchived(store, 'material', true));
    const raw = data.get(KEY);
    expect(saved(repo.setMaterialArchived(store, 'material', true))).toBe(store);
    expect(data.get(KEY)).toBe(raw);
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    store = saved(repo.setMaterialArchived(store, 'material', false));
    expect(saved(repo.setMaterialArchived(store, 'material', false))).toBe(store);
    expect(repo.setMaterialArchived(store, 'missing', true)).toMatchObject({ ok: false, code: 'validation' });
    expect(localStorage.setItem).toHaveBeenCalledTimes(2);
  });

  it('rejects new study while archived, then permits it after restore without changing earlier snapshots', () => {
    const original = load();
    let store = saved(repo.setMaterialArchived(original, 'material', true));
    const raw = data.get(KEY);
    expect(repo.recordMaterialStudy(store, 'material', '新規', 'event-new')).toMatchObject({ ok: false, code: 'validation' });
    expect(data.get(KEY)).toBe(raw);
    // Retrying a previously completed event remains harmless and idempotent.
    expect(saved(repo.recordMaterialStudy(store, 'material', '記録時のコメント0', 'event-0'))).toBe(store);
    store = saved(repo.setMaterialArchived(store, 'material', false));
    store = saved(repo.recordMaterialStudy(store, 'material', '新規', 'event-new'));
    expect(store.materialStudyEvents!.slice(0, 5)).toEqual(original.materialStudyEvents);
    expect(countMaterialStudies(store.materialStudyEvents)).toBe(6);
  });

  it('ordinary title, URL and comment saves preserve the current archive state', () => {
    let store = saved(repo.setMaterialArchived(load(), 'material', true));
    const archivedAt = store.materials![0]!.archivedAt;
    const { archivedAt: _archive, ...withoutArchive } = store.materials![0]!;
    store = saved(repo.saveMaterial(store, { ...withoutArchive, title: '編集後', url: 'https://example.com/new', comment: '新しいメモ' }));
    expect(store.materials![0]).toMatchObject({ title: '編集後', comment: '新しいメモ', archivedAt });
    store = saved(repo.setMaterialArchived(store, 'material', false));
    store = saved(repo.saveMaterial(store, { ...store.materials![0]!, archivedAt }));
    expect(store.materials![0]).not.toHaveProperty('archivedAt');
  });

  it('reserves archived URLs for both registration and URL edits and links to restoration', () => {
    let store = saved(repo.setMaterialArchived(load(), 'material', true));
    store = saved(repo.saveMaterial(store, material({ id: 'other', url: 'https://example.com/other' })));
    const raw = data.get(KEY);
    for (const id of ['new', 'other']) {
      const result = repo.saveMaterial(store, material({ id, url: 'HTTPS://EXAMPLE.COM:443/lesson' }));
      expect(result).toMatchObject({ ok: false, code: 'validation', duplicateMaterialId: 'material' });
      if (!result.ok) expect(result.reason).toContain('復元');
    }
    expect(data.get(KEY)).toBe(raw);
  });

  it.each([true, false])('does not change memory or storage if an archive=%s write fails, and can retry', (archive) => {
    let store = load();
    if (!archive) store = saved(repo.setMaterialArchived(store, 'material', true));
    const original = structuredClone(store), raw = data.get(KEY);
    for (const error of [new DOMException('full', 'QuotaExceededError'), new Error('denied')]) {
      vi.mocked(localStorage.setItem).mockImplementationOnce(() => { throw error; });
      expect(repo.setMaterialArchived(store, 'material', archive)).toMatchObject({ ok: false,
        code: error instanceof DOMException ? 'quota' : 'access' });
      expect(data.get(KEY)).toBe(raw); expect(store).toEqual(original);
    }
    expect(saved(repo.setMaterialArchived(store, 'material', archive)).materials![0]!.archivedAt !== undefined).toBe(archive);
  });

  it.each([true, false])('blocks stale archive=%s operations and detects same-revision writes before persistence', (archive) => {
    let store = load();
    if (!archive) store = saved(repo.setMaterialArchived(store, 'material', true));
    const external = JSON.stringify({ ...store, materials: [{ ...store.materials![0], comment: '別画面のメモ' }] });
    let reads = 0;
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (++reads === 2) data.set(KEY, external);
      return data.get(key) ?? null;
    });
    expect(repo.setMaterialArchived(store, 'material', archive)).toMatchObject({ ok: false, code: 'conflict' });
    expect(data.get(KEY)).toBe(external);
    const current = load();
    const next = saved(repo.saveMaterial(current, { ...current.materials![0]!, comment: 'さらに新しいメモ' }));
    expect(repo.setMaterialArchived(current, 'material', archive)).toMatchObject({ ok: false, code: 'conflict' });
    expect(load()).toEqual(next);
  });

  it('fails safely on inaccessible, removed or corrupt storage', () => {
    const store = load();
    vi.mocked(localStorage.getItem).mockImplementationOnce(() => { throw new Error('blocked'); });
    expect(repo.setMaterialArchived(store, 'material', true)).toMatchObject({ ok: false, code: 'access' });
    data.set(KEY, '{broken');
    expect(repo.setMaterialArchived(store, 'material', true)).toMatchObject({ ok: false, code: 'corrupt' });
    expect(data.get(KEY)).toBe('{broken');
    data.set(KEY, JSON.stringify({ ...store, revision: 1 }));
    const current = load(); data.delete(KEY);
    expect(repo.setMaterialArchived(current, 'material', true)).toMatchObject({ ok: false, code: 'conflict' });
    expect(data.has(KEY)).toBe(false);
  });

  it('includes archive state in the fingerprint even when the modification timestamp is unchanged', () => {
    const active = material();
    expect(materialFingerprint({ ...active, archivedAt: active.updatedAt })).not.toBe(materialFingerprint(active));
  });
});

describe('archive backups and provenance', () => {
  it.each([true, false])('repeated merge keeps local archive=%s and contents for known URL or source identities', (archive) => {
    const backup = load();
    let store = archive ? saved(repo.setMaterialArchived(backup, 'material', true)) : backup;
    const incoming = structuredClone(backup);
    incoming.materials![0]!.title = 'バックアップの名前';
    if (!archive) incoming.materials![0]!.archivedAt = NOW;
    store = saved(repo.importJson(store, JSON.stringify(incoming), 'merge'));
    const first = structuredClone(store);
    expect(store.materials![0]!.title).toBe('教材');
    expect(store.materials![0]!.archivedAt !== undefined).toBe(archive);
    // Editing the URL keeps provenance so the next import does not recreate the archived original.
    store = saved(repo.saveMaterial(store, { ...store.materials![0]!, url: 'https://example.com/changed' }));
    const expected = structuredClone(store);
    store = saved(repo.importJson(store, JSON.stringify(incoming), 'merge'));
    store = saved(repo.importJson(store, JSON.stringify(incoming), 'merge'));
    expect(store.materials).toEqual(expected.materials);
    expect(store.materialStudyEvents).toEqual(first.materialStudyEvents);
    expect(totals(store)).toEqual(totals(backup));
  });

  it('new archived imports retain status through remapped IDs, repeated merge, export and replacement', () => {
    let store = load();
    const incoming: Store = { ...emptyStore(), materials: [material({ url: 'https://example.com/foreign', archivedAt: NOW })],
      materialStudyEvents: [{ id: 'event-0', materialId: 'material', at: NOW, title: '別の履歴',
        url: 'https://example.com/foreign', comment: '残す記録' }] };
    store = saved(repo.importJson(store, JSON.stringify(incoming), 'merge'));
    const imported = store.materials!.find(item => item.url === 'https://example.com/foreign')!;
    expect(imported.id).not.toBe('material'); expect(imported.archivedAt).toBe(NOW);
    expect(store.materialStudyEvents!.at(-1)!.materialId).toBe(imported.id);
    const first = structuredClone(store);
    store = saved(repo.importJson(store, JSON.stringify(incoming), 'merge'));
    expect(store.materials).toEqual(first.materials); expect(store.materialStudyEvents).toEqual(first.materialStudyEvents);
    const backup = repo.exportJson(store);
    store = saved(repo.setMaterialArchived(store, imported.id, false));
    store = saved(repo.importJson(store, backup, 'replace'));
    expect(store.materials).toEqual(first.materials); expect(store.materialStudyEvents).toEqual(first.materialStudyEvents);
    expect(load().materials).toEqual(first.materials);
    expect(totals(store)).toEqual(totals(first));
  });

  it('uses old backup active state on replace and preserves local archive on merge', () => {
    const old = load();
    let store = saved(repo.setMaterialArchived(old, 'material', true));
    store = saved(repo.importJson(store, JSON.stringify(old), 'merge'));
    expect(store.materials![0]!.archivedAt).toBe(NOW);
    store = saved(repo.importJson(store, JSON.stringify(old), 'replace'));
    expect(store.materials![0]).not.toHaveProperty('archivedAt');
    expect(store.materialStudyEvents).toEqual(old.materialStudyEvents);
  });

  it.each([null, true, 42, '', 'not a date', '2026-10-06', '2026-02-30T00:00:00Z', '2026-10-06T24:00:00Z'])('rejects invalid archive timestamp %s on load and both import modes without writing', (archivedAt) => {
    const current = load(), before = data.get(KEY);
    const invalid = JSON.stringify({ ...current, materials: [{ ...material(), archivedAt }] });
    for (const mode of ['merge', 'replace'] as const) {
      expect(repo.importJson(current, invalid, mode)).toMatchObject({ ok: false, code: 'validation' });
      expect(data.get(KEY)).toBe(before);
    }
    data.set(KEY, invalid);
    expect(repo.load()).toMatchObject({ ok: false, code: 'corrupt', raw: invalid });
    expect(data.get(KEY)).toBe(invalid); expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});
