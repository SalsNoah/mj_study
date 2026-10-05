import { describe, expect, it } from 'vitest';
import type { LearningMaterial } from '@/domain/types';
import { filterMaterials, youtubeThumbnailUrl } from './materialList';

const id = 'M7lc1UVf-VE';
const expected = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

describe('public video thumbnail recognition', () => {
  it.each([
    `https://www.youtube.com/watch?v=${id}`, `https://youtube.com/watch?v=${id}&list=private-list&si=private-share#note`,
    `https://m.youtube.com/watch?v=${id}`, `https://music.youtube.com/watch?v=${id}`, `https://youtu.be/${id}?t=90&si=private`,
    `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/live/${id}`, `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`, `http://youtube.com/watch?v=${id}`, `https://YOUTUBE.COM:443/watch?v=${id}`,
  ])('uses only the video ID for %s', (url) => expect(youtubeThumbnailUrl(url)).toBe(expected));

  it.each([
    `https://youtube.com.evil.example/watch?v=${id}`, `https://evil.example/?url=https://youtu.be/${id}`,
    `https://youtube.com@evil.example/watch?v=${id}`, `https://user:pass@youtube.com/watch?v=${id}`,
    `javascript:alert(1)`, `data:text/html,x`, `file:///youtube.com/watch?v=${id}`, `https://youtube.com:8443/watch?v=${id}`,
    `https://youtube.com/playlist?list=${id}`, `https://youtube.com/@${id}/live`, `https://youtube.com/channel/${id}`,
    `https://youtube.com/watch?v=${id}&v=aaaaaaaaaaa`, `https://youtu.be/${id}/extra`, `https://youtube.com/shorts/${id}/extra`,
    `https://youtube.com/watch?v=../secret`, `https://youtu.be/%2F${id}`, `https://youtu.be/too-short`, `https://note.com/lesson`, '',
  ])('keeps unsupported or unsafe input local: %s', (url) => expect(youtubeThumbnailUrl(url)).toBeNull());
});

const item = (id: string, title: string, url: string): LearningMaterial => ({ id, title, url, comment: 'private-note-marker', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
const rows = [item('a', '牌効率 ＡＢＣ １２３', 'https://youtube.com/watch?v=M7lc1UVf-VE'), item('b', '押し引き', 'https://note.com/mahjong/%E9%BA%BB%E9%9B%80'), item('c', 'メモ .*', 'https://example.com/video')];

describe('local material search', () => {
  it('matches normalized title and URL words without changing order or data', () => {
    const before = JSON.stringify(rows);
    expect(filterMaterials(rows, 'abc 123').map(x => x.id)).toEqual(['a']);
    expect(filterMaterials(rows, 'ＮＯＴＥ 麻雀').map(x => x.id)).toEqual(['b']);
    expect(filterMaterials(rows, 'youtube M7lc').map(x => x.id)).toEqual(['a']);
    expect(filterMaterials(rows, '　')).toBe(rows);
    expect(JSON.stringify(rows)).toBe(before);
  });
  it('treats symbols literally and distinguishes no matches from an empty library', () => {
    expect(filterMaterials(rows, '.*').map(x => x.id)).toEqual(['c']);
    expect(filterMaterials(rows, 'private-note-marker')).toHaveLength(0);
    expect(filterMaterials(rows, 'missing')).toHaveLength(0);
    expect(filterMaterials([], 'missing')).toHaveLength(0);
  });
});
