import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { materialSourceIds, materialStudySourceIds } from '@/domain/materials';
import { emptyStore, type LearningMaterial, type MaterialStudyEvent, type Store } from '@/domain/types';
import { LocalStorageRepository, type SaveResult } from './repository';

const KEY = 'material-provenance:v1';
const NOW = '2026-10-05T10:00:00.000Z';
const material = (extra: Partial<LearningMaterial> = {}): LearningMaterial => ({
  id: 'm', title: '教材', url: 'https://example.com/original', comment: '', createdAt: NOW, updatedAt: NOW, ...extra,
});
const event = (extra: Partial<MaterialStudyEvent> = {}): MaterialStudyEvent => ({
  id: 'e', materialId: 'm', title: '教材', url: 'https://example.com/original', comment: '同じ感想', at: NOW, ...extra,
});
const backup = (events: MaterialStudyEvent[] = [], item = material()): Store => ({
  ...emptyStore(), materials: [item], materialStudyEvents: events,
});
function success(result: SaveResult): Store {
  expect(result.ok, result.ok ? '' : result.reason).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.store;
}
let data: Map<string, string>;
let repo: LocalStorageRepository;
function load(): Store {
  const result = repo.load();
  if (!result.ok) throw new Error(result.reason);
  return result.store;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  // Existing-user fixture; first-use defaults are covered in initialMaterials.test.ts.
  data = new Map([[KEY, JSON.stringify(emptyStore())]]);
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn((key: string) => { data.delete(key); }),
    key: vi.fn((index: number) => [...data.keys()][index] ?? null),
    get length() { return data.size; },
  });
  repo = new LocalStorageRepository(KEY);
});
afterEach(() => { repo.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('material import identities', () => {
  it.each([
    ['legacy', false], ['legacy', true], ['sourceIds', false], ['sourceIds', true],
  ] as const)('preserves one edited %s material after reimport, including undo of all history (%s)', (format, undo) => {
    const sourceStore = backup(undo ? [event()] : []);
    if (format === 'sourceIds') {
      sourceStore.materials![0]!.sourceIds = materialSourceIds(sourceStore.materials![0]!);
      for (const item of sourceStore.materialStudyEvents!) item.sourceIds = materialStudySourceIds(item);
    }
    const source = JSON.stringify(sourceStore);
    let current = success(repo.importJson(load(), source, 'merge'));
    current = success(repo.saveMaterial(current, { ...current.materials![0]!, url: 'https://example.com/edited', comment: '新しいメモ' }));
    if (undo) current = success(repo.undoMaterialStudy(current, 'e'));
    current = success(repo.importJson(load(), source, 'merge'));
    expect(current.materials).toHaveLength(1);
    expect(current.materials![0]).toMatchObject({ url: 'https://example.com/edited', comment: '新しいメモ' });
    const before = structuredClone(current);
    current = success(repo.importJson(current, source, 'merge'));
    expect(current.materials).toEqual(before.materials);
    expect(current.materialStudyEvents).toEqual(before.materialStudyEvents);
  });

  it('captures an old local material identity before its first URL edit, without requiring study history', () => {
    const original = backup();
    data.set(KEY, JSON.stringify(original));
    let current = load();
    expect(current.materials![0]!.sourceIds).toBeUndefined();
    current = success(repo.saveMaterial(current, { ...current.materials![0]!, url: 'https://example.com/edited' }));
    expect(current.materials![0]!.sourceIds).toEqual(materialSourceIds(original.materials![0]!));
    current = success(repo.importJson(current, JSON.stringify(original), 'merge'));
    expect(current.materials).toHaveLength(1);
    expect(current.materials![0]!.url).toBe('https://example.com/edited');
  });

  it('retains every source alias when an older editor baseline saves after a URL-based merge', () => {
    let current = success(repo.saveMaterial(load(), material()));
    const baseline = structuredClone(current.materials![0]!);
    const other = backup([], material({ id: 'other', comment: '取り込む側のメモ' }));
    current = success(repo.importJson(current, JSON.stringify(other), 'merge'));
    const aliases = current.materials![0]!.sourceIds;
    expect(aliases).toHaveLength(2);
    current = success(repo.saveMaterial(current, { ...baseline, url: 'https://example.com/edited', comment: '私の編集' }));
    expect(current.materials![0]!.sourceIds).toEqual(aliases);
    current = success(repo.importJson(current, JSON.stringify(other), 'merge'));
    expect(current.materials).toHaveLength(1);
    expect(current.materials![0]).toMatchObject({ url: 'https://example.com/edited', comment: '私の編集' });
  });

  it('preserves distinct e and e:import:1 events with identical snapshots when local e already exists', () => {
    let current = success(repo.importJson(load(), JSON.stringify(backup([event({ comment: '既存の別イベント' })])), 'merge'));
    const source = JSON.stringify(backup([event(), event({ id: 'e:import:1' })]));
    current = success(repo.importJson(current, source, 'merge'));
    expect(current.materialStudyEvents).toHaveLength(3);
    expect(current.materialStudyEvents!.map(({ comment }) => comment).sort()).toEqual(['既存の別イベント', '同じ感想', '同じ感想'].sort());
    expect(new Set(current.materialStudyEvents!.flatMap((item) => item.sourceIds!)).size).toBe(3);
    const once = structuredClone(current.materialStudyEvents);
    current = success(repo.importJson(load(), source, 'merge'));
    expect(current.materialStudyEvents).toEqual(once);

    // A new-format export keeps original source identities despite local ID collisions and another material-ID remap.
    const exported = repo.exportJson(current);
    const other = new LocalStorageRepository('other-material-browser:v1');
    let otherStore = success(other.saveMaterial(emptyStore(), material({ url: 'https://example.com/unrelated' })));
    otherStore = success(other.importJson(otherStore, exported, 'merge'));
    otherStore = success(other.importJson(otherStore, source, 'merge'));
    expect(otherStore.materials).toHaveLength(2);
    expect(otherStore.materialStudyEvents).toHaveLength(3);
    expect(otherStore.materialStudyEvents!.flatMap((item) => item.sourceIds!)).toEqual(once!.flatMap((item) => item.sourceIds!));
    other.dispose();
  });

  it.each(['merge', 'replace'] as const)('round-trips new source metadata through %s and accepts old backups without it', (mode) => {
    const original = backup([event()]);
    let current = success(repo.importJson(load(), JSON.stringify(original), mode));
    current = success(repo.saveMaterial(current, { ...current.materials![0]!, comment: '私のメモ' }));
    const exported = repo.exportJson(current);
    const before = structuredClone(current);
    current = success(repo.importJson(current, exported, mode));
    expect(current.materials).toEqual(before.materials);
    expect(current.materialStudyEvents?.map(({ id, comment }) => ({ id, comment })))
      .toEqual(before.materialStudyEvents?.map(({ id, comment }) => ({ id, comment })));
    expect(current.materials![0]!.sourceIds).toEqual(before.materials![0]!.sourceIds);
  });

  it.each([
    { materials: [material({ sourceIds: [] })] },
    { materials: [material({ sourceIds: ['', 'x'] })] },
    { materials: [material({ sourceIds: ['x', 'x'] })] },
    { materials: [material(), { ...material({ id: 'other', url: 'https://example.com/other' }), sourceIds: materialSourceIds(material()) }] },
    { materialStudyEvents: [event({ sourceIds: [] })] },
    { materialStudyEvents: [event({ sourceIds: ['x'] }), event({ id: 'other', sourceIds: ['x'] })] },
    { materialStudyEvents: [{ ...event(), sourceIds: 'invalid' }] },
  ])('rejects malformed or duplicate source metadata without writing %#', (fields) => {
    const current = success(repo.saveMaterial(load(), material()));
    const before = data.get(KEY);
    const source = JSON.stringify({ ...backup([event()]), ...fields });
    for (const mode of ['merge', 'replace'] as const) {
      expect(repo.importJson(current, source, mode)).toMatchObject({ ok: false, code: 'validation' });
      expect(data.get(KEY)).toBe(before);
    }
    data.set(KEY, source);
    expect(repo.load()).toMatchObject({ ok: false, code: 'corrupt' });
    expect(data.get(KEY)).toBe(source);
  });

  it('rejects contradictory snapshots claiming an already imported source instead of discarding either silently', () => {
    let current = success(repo.importJson(load(), JSON.stringify(backup([event()])), 'merge'));
    const original = current.materialStudyEvents![0]!;
    const changed = backup([{ ...original, comment: '元IDの内容を変更したもの' }], current.materials![0]!);
    const before = data.get(KEY);
    expect(repo.importJson(current, JSON.stringify(changed), 'merge')).toMatchObject({ ok: false, code: 'validation' });
    expect(data.get(KEY)).toBe(before);
    current = load();
    expect(current.materialStudyEvents).toEqual([original]);
  });
});
