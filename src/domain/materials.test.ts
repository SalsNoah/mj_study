import { describe, expect, it } from 'vitest';
import { countMaterialStudies, MATERIAL_LIMITS, normalizeMaterialUrl, uniqueMaterialStudyEvents, validateMaterialData } from './materials';
import type { LearningMaterial, MaterialStudyEvent } from './types';

const material: LearningMaterial = {
  id: 'material1', title: '押し引き講座', url: 'https://www.youtube.com/watch?v=abc', comment: '復習する',
  createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z',
};
const event: MaterialStudyEvent = {
  id: 'event1', materialId: material.id, at: '2026-10-01T09:00:00.000Z',
  title: material.title, url: material.url, comment: '理由を整理した',
};

describe('material URLs', () => {
  it('normalizes scheme, host and default port while keeping video queries and fragments', () => {
    expect(normalizeMaterialUrl('  HTTPS://WWW.YouTube.COM:443/watch?v=AbC&t=40#chapter-2  ')).toEqual({
      ok: true, url: 'https://www.youtube.com/watch?v=AbC&t=40#chapter-2',
    });
    expect(normalizeMaterialUrl('HTTP://NOTE.COM:80')).toEqual({ ok: true, url: 'http://note.com/' });
    expect(normalizeMaterialUrl('https://note.com/author/n/nAbC?x=1&x=2')).toEqual({
      ok: true, url: 'https://note.com/author/n/nAbC?x=1&x=2',
    });
    expect(normalizeMaterialUrl('https://example.com:8443/Path/?z=2&a=1')).toEqual({
      ok: true, url: 'https://example.com:8443/Path/?z=2&a=1',
    });
  });

  it.each([
    '', '   ', 'javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'ftp://example.com/a',
    '//youtube.com/watch?v=x', '/relative', 'www.youtube.com', 'https://', 'https:////example.com',
    'https://user:password@example.com', 'https://user@example.com', 'https://@example.com', 'https://example.com\\@evil.com',
    'https://example.com/a\nb', 'https://example.com/a\tb', 'https://example.com/with space',
    'https://example.com:99999/', `https://example.com/${'x'.repeat(MATERIAL_LIMITS.url)}`,
  ])('rejects unsafe or malformed input: %s', (url) => {
    expect(normalizeMaterialUrl(url).ok).toBe(false);
  });
});

describe('material events', () => {
  it('counts distinct event IDs consistently, with first occurrence winning for all consumers', () => {
    const other = { ...event, id: 'event2', materialId: 'material2' };
    const events = [event, { ...event, materialId: 'material2', comment: 'duplicate' }, other];
    expect(uniqueMaterialStudyEvents(events)).toEqual([event, other]);
    expect(countMaterialStudies(events)).toBe(2);
    expect(countMaterialStudies(events, material.id)).toBe(1);
    expect(countMaterialStudies(events, 'material2')).toBe(1);
    expect(countMaterialStudies(undefined)).toBe(0);
  });

  it('accepts old backups with neither optional field and normalizes new fields without mutating input', () => {
    expect(validateMaterialData({})).toEqual({ ok: true });
    const source = { materials: [{ ...material, title: ' 押し引き講座 ', url: 'HTTPS://NOTE.COM:443' }], materialStudyEvents: [event] };
    const original = structuredClone(source);
    expect(validateMaterialData(source)).toMatchObject({ ok: true, materials: [{ title: material.title, url: 'https://note.com/' }] });
    expect(source).toEqual(original);
  });

  it.each([
    { materials: null },
    { materials: [null] },
    { materials: [{ ...material, title: '' }] },
    { materials: [{ ...material, title: 'x'.repeat(MATERIAL_LIMITS.title + 1) }] },
    { materials: [{ ...material, comment: 'x'.repeat(MATERIAL_LIMITS.comment + 1) }] },
    { materials: [{ ...material, createdAt: '2026-02-30T01:00:00Z' }] },
    { materials: [{ ...material, updatedAt: '2026-10-01' }] },
    { materials: [material, { ...material }] },
    { materials: [material, { ...material, id: 'other', url: 'HTTPS://WWW.YouTube.COM:443/watch?v=abc' }] },
    { materials: [material], materialStudyEvents: null },
    { materials: [material], materialStudyEvents: [null] },
    { materials: [material], materialStudyEvents: [event, event] },
    { materials: [material], materialStudyEvents: [{ ...event, materialId: 'missing' }] },
    { materials: [material], materialStudyEvents: [{ ...event, at: 'not a date' }] },
    { materials: [material], materialStudyEvents: [{ ...event, url: 'javascript:alert(1)' }] },
    { materialStudyEvents: [event] },
  ])('rejects invalid or ambiguous backup fields %#', (fields) => {
    expect(validateMaterialData(fields).ok).toBe(false);
  });
});
