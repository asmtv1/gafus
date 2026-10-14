import { describe, expect, it } from "vitest";
import { scopedMediaCacheKey } from "./scopedMediaCache";
const key = "posts/owner/post/attachments/id/full.webp";
describe("private mobile media cache isolation", () => {
  it("does not create a different disk key for every new signed token", () => {
    const now = 180_000_001;
    const first = `https://garaquachegasourn.begetcdn.cloud/md5(${'A'.repeat(22)},1800000000)/${key}`;
    const second = first.replace('A'.repeat(22), 'B'.repeat(22));
    expect(scopedMediaCacheKey(first, "actor", now)).toBe(scopedMediaCacheKey(second, "actor", now));
    expect(scopedMediaCacheKey(first, "actor", now)).not.toBe(scopedMediaCacheKey(first, "actor2", now));
    expect(scopedMediaCacheKey(first, "actor", now + 180_000)).not.toBe(scopedMediaCacheKey(first, "actor", now));
  });
  it("rejects wrong CDN token syntax, cross-product media paths and unsigned Cloud.ru objects", () => {
    const token = 'A'.repeat(22);
    const url = `https://garaquachegasourn.begetcdn.cloud/md5(${token},1800000000)/${key}`;
    const origin = `https://s3.cloud.ru/gafus-feed-private/${key}?X-Amz-Signature=secret`;
    expect(scopedMediaCacheKey(origin, 'viewer')).toContain('/' + key);
    for (const invalid of [
      url.replace('garaquachegasourn', 'mepsuduyokabib'),
      url.replace('/md5(', '/md5(INVALID'),
      url + '?ignored=true',
      url.replace('full.webp', 'source.mp4'),
      origin.replace('X-Amz-Signature=secret', 'expires=1800000000'),
      origin.replace('gafus-feed-private', 'gafus-documents-private'),
      `https://feed.gafus.ru/${key}?md5=${token}&expires=1800000000`,
    ]) expect(() => scopedMediaCacheKey(invalid, 'viewer')).toThrow();
  });
  it("includes immutable object version in key and rejects nonapproved endpoints", () => {
    const url = `https://mepsuduyokabib.begetcdn.cloud/md5(${'A'.repeat(22)},1800000000)/albums/a/b/photos/photo1/full.webp`;
    expect(scopedMediaCacheKey(url, "actor")).not.toBe(scopedMediaCacheKey(url.replace('photo1', 'photo2'), 'actor'));
    expect(() => scopedMediaCacheKey(url, '')).toThrow();
    expect(() => scopedMediaCacheKey(url.replace('mepsuduyokabib.begetcdn.cloud', 'evil.test'), 'actor')).toThrow();
  });
});
