import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialMaterials } from '@/data/initialMaterials';
import { countMaterialStudies } from '@/domain/materials';
import { emptyStore, STORAGE_KEY, type Store } from '@/domain/types';
import { LocalStorageRepository, type SaveResult } from './repository';

let repo: LocalStorageRepository;
function load() {
  const result = repo.load();
  if (!result.ok) throw new Error(result.reason);
  return result.store;
}
function saved(result: SaveResult) {
  if (!result.ok) throw new Error(result.reason);
  return result.store;
}
function restart() {
  repo.dispose();
  repo = new LocalStorageRepository();
  return load();
}
beforeEach(() => {
  localStorage.clear();
  repo = new LocalStorageRepository();
});
afterEach(() => { repo.dispose(); vi.restoreAllMocks(); });

describe('new user learning materials', () => {
  it('shows exactly the requested videos in order without writing, fetching or counting study', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const store = load();
    expect(store.materials?.map(({ url }) => url)).toEqual([
      'https://youtu.be/apqIuvnVA9M', 'https://youtu.be/8emBEqgAFzc', 'https://youtu.be/2LjOtn6pgb8',
    ]);
    expect(store.materials?.every(({ comment }) => comment === '')).toBe(true);
    expect(countMaterialStudies(store.materialStudyEvents)).toBe(0);
    expect(store).toEqual({ ...emptyStore(), materials: createInitialMaterials() });
    expect(restart()).toEqual(store);
    expect(write).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('persists once through a normal save and never duplicates on restart or duplicate registration', () => {
    const store = saved(repo.updateSettings(load(), { autoSort: false }));
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(restart()).toEqual(store);
    const duplicate = repo.saveMaterial(store, { ...store.materials![0]!, id: 'another-id', comment: 'overwrite attempt' });
    expect(duplicate).toMatchObject({ ok: false, duplicateMaterialId: store.materials![0]!.id });
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    expect(restart().materials).toHaveLength(3);
  });

  it('does not resurrect removed materials or an explicitly cleared store', () => {
    const initial = load();
    saved(repo.replaceStore({ ...initial, materials: initial.materials!.slice(1) }));
    expect(restart().materials).toHaveLength(2);
    saved(repo.clearAll());
    expect(restart().materials ?? []).toEqual([]);
    expect(countMaterialStudies(load().materialStudyEvents)).toBe(0);
  });

  it('keeps archived materials archived after restart without replacing comments or events', () => {
    let store = load();
    const first = store.materials![0]!;
    store = saved(repo.recordMaterialStudy(store, first.id, '自分のコメント', 'manual-study'));
    store = saved(repo.setMaterialArchived(store, first.id, true));
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(restart()).toEqual(store);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    expect(countMaterialStudies(store.materialStudyEvents)).toBe(1);
  });

  it.each([false, true])('keeps existing user bytes unchanged (with material fields: %s)', (hasMaterials) => {
    const existing: Store = { ...emptyStore(), revision: 14, settings: { autoSort: false } };
    if (hasMaterials) {
      const material = { ...createInitialMaterials()[1]!, title: '編集済み', comment: '大切なコメント' };
      existing.materials = [material];
      existing.materialStudyEvents = [{ id: 'existing-study', materialId: material.id,
        at: material.createdAt, title: material.title, url: material.url, comment: material.comment }];
    }
    const raw = JSON.stringify(existing, null, 2);
    localStorage.setItem(STORAGE_KEY, raw);
    const loaded = restart();
    expect(loaded.materials ?? []).toEqual(existing.materials ?? []);
    expect(loaded.materialStudyEvents ?? []).toEqual(existing.materialStudyEvents ?? []);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it.each(['merge', 'replace'] as const)('roundtrips a backup twice with %s without duplicate materials or study events', (mode) => {
    let store = load();
    store = saved(repo.recordMaterialStudy(store, store.materials![0]!.id, '保存したメモ', 'once'));
    const backup = repo.exportJson(store);
    store = saved(repo.importJson(store, backup, mode));
    store = saved(repo.importJson(store, backup, mode));
    expect(restart()).toEqual(store);
    expect(store.materials).toHaveLength(3);
    expect(store.materials![0]!.comment).toBe('保存したメモ');
    expect(countMaterialStudies(store.materialStudyEvents)).toBe(1);
  });

  it('replacing with an old empty backup removes defaults and does not seed them on restart', () => {
    saved(repo.importJson(load(), JSON.stringify(emptyStore()), 'replace'));
    expect(restart().materials ?? []).toEqual([]);
    expect(load().materialStudyEvents ?? []).toEqual([]);
  });

  it('can explicitly add and undo sample problems before the first save without losing starter materials', () => {
    const initial = load();
    const updated = saved(repo.updateSampleCatalog(initial, []));
    expect(updated.problems).toHaveLength(10);
    expect(updated.materials).toEqual(initial.materials);
    const backups = repo.listSampleCatalogBackups();
    if (!backups.ok) throw new Error(backups.reason);
    const id = backups.backups[0]!.id;
    const snapshot = repo.exportSampleCatalogSnapshot(id);
    if (!snapshot.ok) throw new Error(snapshot.reason);
    expect(JSON.parse(snapshot.text).materials).toEqual(initial.materials);
    const restored = saved(repo.restoreSampleCatalog(updated, id));
    expect(restored.problems).toHaveLength(0);
    expect(restart().materials).toEqual(initial.materials);
  });

  it.each(['{broken', JSON.stringify({ ...emptyStore(), schemaVersion: 999 })])('never seeds corrupt or future storage', (raw) => {
    localStorage.setItem(STORAGE_KEY, raw);
    expect(repo.load().ok).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });
});
