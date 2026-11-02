import { describe, expect, it } from "vitest";
import { scopedMediaCacheKey, isLongLivedPublicFeedCdnUrl } from "./scopedMediaCache";
const key = "posts/owner/post/attachments/id/full.webp";
describe("private mobile media cache isolation", () => {
  it("keeps a single 24h disk key only for validated public long-lived Feed variants", () => {
    const now = Date.parse("2026-11-02T10:00:00.000Z");
    const cdn = "https://quepraquiecebquomiel.begetcdn.cloud/media/v2/media123/v1/image/m.webp";
    const url = cdn + "?md5=" + "A".repeat(22) + "&expires=" + Math.floor((now + 30*3_600_000)/1000);
    const rotated = url.replace("A".repeat(22), "B".repeat(22));
    expect(isLongLivedPublicFeedCdnUrl(url,now)).toBe(true);
    expect(scopedMediaCacheKey(url,"actor",now)).toBe(scopedMediaCacheKey(rotated,"actor",now+180_001));
    expect(scopedMediaCacheKey(url,"actor",now)).not.toBe(scopedMediaCacheKey(url,"actor",now+86_400_001));
    expect(scopedMediaCacheKey(url,"actor",now)).not.toBe(scopedMediaCacheKey(url,"another",now));
    const short = cdn+"?md5="+"A".repeat(22)+"&expires="+Math.floor((now+300_000)/1000);
    expect(isLongLivedPublicFeedCdnUrl(short,now)).toBe(false);
    expect(scopedMediaCacheKey(short,"actor",now)).not.toBe(scopedMediaCacheKey(short,"actor",now+180_000));
    for(const candidate of [
      url.replace("quepraquiecebquomiel","fupiquafifeswu"),
      url.replace("/image/m.webp","/incoming/source.jpg"),
      url+"&extra=1",
      url.replace("https:","http:"),
      "https://s3.cloud.ru/gafus-feed-private/media/v2/media123/v1/image/m.webp?X-Amz-Signature=test",
    ]) expect(isLongLivedPublicFeedCdnUrl(candidate,now)).toBe(false);
  });
  it("caches modern immutable Feed Media V2 per object/version/viewer, not CDN token", () => {
    const now = 180_000_001;
    const first = `https://quepraquiecebquomiel.begetcdn.cloud/media/v2/media1/v2/image/m.webp?md5=${'A'.repeat(22)}&expires=1999999999`;
    const nextSignature = first.replace('A'.repeat(22),'B'.repeat(22));
    const key1 = scopedMediaCacheKey(first,'actor',now);
    expect(key1).toBe(scopedMediaCacheKey(nextSignature,'actor',now));
    expect(key1).not.toContain('md5=');
    expect(key1).not.toContain('1999999999');
    expect(key1).not.toBe(scopedMediaCacheKey(first.replace('/v2/image/','/v3/image/'),'actor',now));
    expect(key1).not.toBe(scopedMediaCacheKey(first,'other',now));
    expect(key1).not.toBe(scopedMediaCacheKey(first,'actor',now+180_000));
    const cloud = `https://s3.cloud.ru/gafus-feed-private/media/v2/media1/v2/image/m.webp?X-Amz-Signature=test`;
    expect(scopedMediaCacheKey(cloud,'actor',now)).toContain('/media/v2/media1/v2/image/m.webp');
  });
  it("never treats unsigned or foreign Feed V2 objects as cacheable", () => {
    const base=`https://quepraquiecebquomiel.begetcdn.cloud/media/v2/media1/v2/image/s.webp?md5=${'A'.repeat(22)}&expires=1999999999`;
    for (const candidate of [
      base.replace('?md5=','?bad='), base+'&extra=1',
      base.replace('quepraquiecebquomiel','fupiquafifeswu'),
      base.replace('image/s.webp','image/source.webp'),
      base.replace('image/s.webp','../../admin.json'),
      base.replace('https:','http:'),
      base.replace('/v2/image/','/v0/image/'),
      'https://s3.cloud.ru/gafus-feed-private/media/v2/media1/v2/image/s.webp',
      'https://s3.cloud.ru/other/media/v2/media1/v2/image/s.webp?X-Amz-Signature=test',
    ]) expect(()=>scopedMediaCacheKey(candidate,'actor')).toThrow();
  });
  it("does not create a different disk key for every new signed token", () => {
    const now = 180_000_001;
    const first = `https://quepraquiecebquomiel.begetcdn.cloud/md5(${'A'.repeat(22)},1800000000)/${key}`;
    const second = first.replace('A'.repeat(22), 'B'.repeat(22));
    expect(scopedMediaCacheKey(first, "actor", now)).toBe(scopedMediaCacheKey(second, "actor", now));
    expect(scopedMediaCacheKey(first, "actor", now)).not.toBe(scopedMediaCacheKey(first, "actor2", now));
    expect(scopedMediaCacheKey(first, "actor", now + 180_000)).not.toBe(scopedMediaCacheKey(first, "actor", now));
  });
  it("rejects wrong CDN token syntax, cross-product media paths and unsigned Cloud.ru objects", () => {
    const token = 'A'.repeat(22);
    const url = `https://quepraquiecebquomiel.begetcdn.cloud/md5(${token},1800000000)/${key}`;
    const origin = `https://s3.cloud.ru/gafus-feed-private/${key}?X-Amz-Signature=secret`;
    expect(scopedMediaCacheKey(origin, 'viewer')).toContain('/' + key);
    for (const invalid of [
      url.replace('quepraquiecebquomiel', 'fupiquafifeswu'),
      url.replace('/md5(', '/md5(INVALID'),
      url + '?ignored=true',
      url.replace('full.webp', 'source.mp4'),
      origin.replace('X-Amz-Signature=secret', 'expires=1800000000'),
      origin.replace('gafus-feed-private', 'gafus-documents-private'),
      `https://feed.gafus.ru/${key}?md5=${token}&expires=1800000000`,
    ]) expect(() => scopedMediaCacheKey(invalid, 'viewer')).toThrow();
  });
  it('supports the new Gallery CDN and versioned keys without persisting signed tokens', () => {
    const path='/gallery/u/media/m/v2/full.webp';
    const token='A'.repeat(22);
    const url=`https://fupiquafifeswu.begetcdn.cloud/md5(${token},1999999999)${path}`;
    const cache=scopedMediaCacheKey(url,'viewer',1_800_000_000);
    expect(cache).toContain(path);
    expect(cache).not.toContain(token);
    expect(scopedMediaCacheKey(url.replace(token,'B'.repeat(22)),'viewer',1_800_000_000)).toBe(cache);
    expect(() => scopedMediaCacheKey(url.replace('full.webp','source.jpg'),'viewer')).toThrow();
  });
  it("never stores expired Beget signatures on disk even within the same 180-second slot", () => {
    const expires = 1_800_000_000;
    const path = '/gallery/u/media/m/v2/thumb.webp';
    const signed = `https://fupiquafifeswu.begetcdn.cloud/md5(${'A'.repeat(22)},${expires})${path}`;
    const now = expires * 1000 - 16_000;
    expect(scopedMediaCacheKey(signed,'viewer',now)).toContain(path);
    expect(() => scopedMediaCacheKey(signed,'viewer',now+2_000)).toThrow('MEDIA_CACHE_EXPIRED');
    const feed=`https://quepraquiecebquomiel.begetcdn.cloud/media/v2/media1/v2/image/m.webp?md5=${'B'.repeat(22)}&expires=${expires}`;
    expect(() => scopedMediaCacheKey(feed,'viewer',now+2_000)).toThrow('MEDIA_CACHE_EXPIRED');
  });
  it("includes immutable object version in key and rejects nonapproved endpoints", () => {
    const url = `https://fupiquafifeswu.begetcdn.cloud/md5(${'A'.repeat(22)},1800000000)/albums/a/b/photos/photo1/full.webp`;
    expect(scopedMediaCacheKey(url, "actor")).not.toBe(scopedMediaCacheKey(url.replace('photo1', 'photo2'), 'actor'));
    expect(() => scopedMediaCacheKey(url, '')).toThrow();
    expect(() => scopedMediaCacheKey(url.replace('fupiquafifeswu.begetcdn.cloud', 'evil.test'), 'actor')).toThrow();
  });
});
