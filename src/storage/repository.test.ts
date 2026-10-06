import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageRepository } from './repository';
import { emptyStore, type Problem } from '@/domain/types';
import { emptyContext } from '@/domain/types';
import { createId, nowIso } from '@/domain/ids';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
    key: () => null,
  } as Storage;
}

function sampleProblem(partial?: Partial<Problem>): Problem {
  const now = nowIso();
  return {
    id: createId('prob'),
    title: 't',
    concealed: ['1m', '2m', '3m'],
    drawn: null,
    melds: [],
    doraIndicators: [],
    answerEnabled: false,
    acceptedDiscards: [],
    explanation: '',
    privateMemo: '',
    tagIds: [],
    context: emptyContext(),
    attachments: [],
    sourceUrl: '',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('LocalStorageRepository', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('persists and reloads problems (A01)', () => {
    const repo = new LocalStorageRepository('test:v1');
    const store = emptyStore();
    const p = sampleProblem({
      concealed: ['0m', '5m', '1z'],
      drawn: '2z',
    });
    const saved = repo.saveProblem(store, p, true);
    expect(saved.ok).toBe(true);
    const loaded = repo.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.store.problems[0]?.drawn).toBe('2z');
    expect(loaded.store.problems[0]?.concealed).toContain('0m');
  });

  it('does not pretend success on quota (A33)', () => {
    const repo = new LocalStorageRepository('test:v1');
    const store = emptyStore();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        const err = new DOMException('quota', 'QuotaExceededError');
        throw err;
      },
      removeItem: () => undefined,
      clear: () => undefined,
      length: 0,
      key: () => null,
    } as Storage);
    const r = repo.saveProblem(store, sampleProblem(), true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('quota');
  });

  it('refuses corrupt / unknown schema without wiping (A34)', () => {
    localStorage.setItem('test:v1', '{not json');
    const repo = new LocalStorageRepository('test:v1');
    const bad = repo.load();
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.code).toBe('corrupt');
      expect(bad.raw).toBeTruthy();
    }

    localStorage.setItem('test:v1', JSON.stringify({ schemaVersion: 99, revision: 1 }));
    const repo2 = new LocalStorageRepository('test:v1');
    const unknown = repo2.load();
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe('unknown_schema');
  });

  it('duplicate resets study history (A37)', () => {
    const repo = new LocalStorageRepository('test:v1');
    let store = emptyStore();
    const p = sampleProblem();
    const saved = repo.saveProblem(store, p, true);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    store = saved.store;
    store = {
      ...store,
      study: store.study.map((s) =>
        s.problemId === p.id
          ? { ...s, confirmationCount: 3, understanding: 'understood' as const }
          : s,
      ),
    };
    localStorage.setItem('test:v1', JSON.stringify(store));
    repo.load();
    const dup = repo.duplicateProblem(store, p.id);
    expect(dup.ok).toBe(true);
    if (!dup.ok) return;
    const copy = dup.store.problems.find((x) => x.id !== p.id);
    const st = dup.store.study.find((s) => s.problemId === copy?.id);
    expect(st?.confirmationCount).toBe(0);
    expect(st?.understanding).toBe('unrated');
  });

  it('refuses a stale problem draft even when the stored revision number is unchanged', () => {
    const repo = new LocalStorageRepository('test:v1');
    try {
      const problem = sampleProblem();
      const saved = repo.saveProblem(emptyStore(), problem, true);
      if (!saved.ok) throw new Error(saved.reason);
      const newer = { ...saved.store, problems: [{ ...problem, title: 'newer' }] };
      localStorage.setItem('test:v1', JSON.stringify(newer));
      const raw = localStorage.getItem('test:v1');
      const result = repo.saveProblem(saved.store, { ...problem, title: 'stale draft' }, false);
      expect(result).toMatchObject({ ok: false, code: 'conflict' });
      expect(localStorage.getItem('test:v1')).toBe(raw);
    } finally { repo.dispose(); }
  });

  it('resubscribes after effect cleanup without duplicating callbacks or writing storage', () => {
    const repo = new LocalStorageRepository('test:v1');
    const handler = vi.fn();
    try {
      const store = emptyStore();
      localStorage.setItem('test:v1', JSON.stringify(store));
      repo.load();
      const raw = localStorage.getItem('test:v1');
      const notify = () => window.dispatchEvent(new StorageEvent('storage', {
        key: 'test:v1', newValue: JSON.stringify({ ...store, revision: 1 }),
      }));
      repo.setExternalChangeHandler(handler);
      notify();
      expect(handler).toHaveBeenCalledTimes(1);
      repo.setExternalChangeHandler(null);
      repo.dispose();
      notify();
      expect(handler).toHaveBeenCalledTimes(1);
      repo.setExternalChangeHandler(handler);
      repo.setExternalChangeHandler(handler);
      notify();
      expect(handler).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem('test:v1')).toBe(raw);
    } finally { repo.dispose(); }
  });
});
