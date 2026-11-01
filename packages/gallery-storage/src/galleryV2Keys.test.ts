import { describe, expect, it } from 'vitest';
import { assertGalleryKey, assertFinalKey, originKey, sourcePattern, sourceUploadId, v2FinalPattern } from './keys';
describe('Gallery Media V2 immutable private photo keys', () => {
  const key = 'gallery/owner_123/media/photo_456/v2/full.webp';
  it('accepts only strict photo-id final keys for the signed CDN', () => {
    expect(v2FinalPattern.test(key)).toBe(true);
    expect(() => assertGalleryKey(key)).not.toThrow();
    expect(() => assertFinalKey(key)).not.toThrow();
    expect(originKey('/' + key)).toBe(key);
  });
  it('refuses path traversal and unrecognized variants', () => {
    for (const invalid of [
      'gallery/owner/media/../v2/full.webp',
      'gallery/owner/media/photo/v2/source.jpg',
      'gallery/owner/media/photo/v2/full.png',
      'gallery/owner/media/photo/v2/other.webp',
      'gallery/owner/media/photo/v2/thumb.webp/../../private',
    ]) expect(() => assertFinalKey(invalid)).toThrow();
  });
  it('never exposes temporary originals through the final-object gate', () => {
    expect(() => assertFinalKey('albums/owner/album/incoming/upload/source.jpg')).toThrow();
    expect(() => originKey('/gallery/owner/media/photo/v2/%2e%2e/secret')).toThrow();
  });
});

describe('Cloud Gallery processor compatibility with live uploaded V2 sources', () => {
  const owner = 'cmhf79vic0000qr4m219z780r';
  const album = 'cmv8goq3o0006o60167w31n0q';
  const upload = 'bddf7953-7977-446b-bca4-77b96b6b1f24';
  const photo = '8166fd2a-fc4f-4281-9e82-0237e7c3916e';
  const source = `albums/${owner}/${album}/incoming/${upload}/source.jpg`;
  const final = `gallery/${owner}/media/${photo}/v2/full.webp`;
  it('accepts exact generated keys used by Gallery API and Cloud.ru Jobs', () => {
    expect(sourcePattern.test(source)).toBe(true);
    expect(sourceUploadId(source)).toBe(upload);
    expect(() => assertGalleryKey(source)).not.toThrow();
    expect(() => assertGalleryKey(final)).not.toThrow();
    expect(() => assertFinalKey(final)).not.toThrow();
  });
  it('accepts the V1 attempts and all supported original formats', () => {
    for (const ext of ['jpg','png','webp'])
      expect(() => assertGalleryKey(source.replace('source.jpg',`source.${ext}`))).not.toThrow();
    for (const name of ['thumb','full'])
      expect(() => assertGalleryKey(`albums/${owner}/${album}/incoming/${upload}/attempts/token_1/${name}.webp`)).not.toThrow();
  });
  it('still rejects traversal, extra suffixes and imitated extensions', () => {
    for (const invalid of [
      source.replace('source.jpg','sourceXjpg'),
      source.replace('source.jpg','source.jpg/../secret'),
      source.replace('/incoming/','/../incoming/'),
      final.replace('full.webp','fullXwebp'),
      final.replace('/media/','/media/../'),
    ]) expect(() => assertGalleryKey(invalid)).toThrow('UNTRUSTED_KEY');
  });
});
