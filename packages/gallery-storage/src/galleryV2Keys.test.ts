import { describe, expect, it } from 'vitest';
import { assertGalleryKey, assertFinalKey, originKey, v2FinalPattern } from './keys';
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
