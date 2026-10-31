import { describe, expect, it, vi } from 'vitest';
import { chat2ImageQuality, chat2ImageSource, chat2VideoQuality, chat2VideoSource, chat2HasVideoQuality, chat2MatchedS3Variant, chat2CdnS3FailoverAllowed } from './index.js';
const sources = { 360: 'https://gafus-chat-public.s3.cloud.ru/chat2/demo/360.mp4', 720: 'https://gafus-chat-public.s3.cloud.ru/chat2/demo/720.mp4' };
describe('Chat2 automatic 360/720 quality shared across Web and Mobile', () => {
  it('selects photo by rendered layout width * device pixel ratio', () => {
    expect(chat2ImageQuality(120, 2)).toBe(360);
    expect(chat2ImageQuality(340, 2)).toBe(720);
    expect(chat2ImageSource(sources, 340, 2)).toBe(sources[720]);
    expect(chat2ImageSource(sources, 220, 2, {360:200,720:500})).toBe(sources[720]);
    expect(chat2ImageSource(sources, 120, 2, {360:200,720:500})).toBe(sources[720]);
    expect(chat2ImageSource(sources, 90, 2, {360:200,720:500})).toBe(sources[360]);
    expect(chat2ImageSource({ 360: sources[360] }, 340, 3)).toBe(sources[360]);
  });
  it('defaults unknown/slow/mobile-small playback to 360', () => {
    expect(chat2VideoQuality('auto', { width: 400 })).toBe(360);
    expect(chat2VideoQuality('auto', { width: 400, downlinkMbps: 5, saveData: true })).toBe(360);
    expect(chat2VideoQuality('auto', { width: 400, downlinkMbps: 5, effectiveType: '3g' })).toBe(360);
    expect(chat2VideoQuality('auto', { width: 220, downlinkMbps: 5 })).toBe(360);
    expect(chat2VideoQuality('auto', { width: 400, downlinkMbps: 5 })).toBe(720);
  });
  it('respects manual choice, falls back when 720 missing, avoids constructed URLs', () => {
    expect(chat2VideoSource(sources, 720, { width: 220 })).toBe(sources[720]);
    expect(chat2VideoSource({ 360: sources[360] }, 720, { width: 500 })).toBe(sources[360]);
    expect(chat2VideoSource({}, 'auto', { width: 500 })).toBeNull();
    expect(chat2HasVideoQuality(sources, 720)).toBe(true);
    expect(chat2HasVideoQuality({360:'http://insecure'},360)).toBe(false);
  });
});


describe('Chat2 exact-key CDN → S3 delivery', () => {
  const root = 'chat2/room/user/00000000-0000-4000-8000-000000000000/v1/';
  const cdn = 'https://gonomudedoje.begetcdn.cloud/' + root;
  const s3 = 'https://gafus-chat2-media-2026.s3.cloud.ru/' + root;
  const response = {
    url: cdn + 'video/360.mp4', fallbackUrl: s3 + 'video/360.mp4',
    renditions: {video: {360: cdn + 'video/360.mp4', 720: cdn + 'video/720.mp4'},
      image: {360: cdn + 'image/s.webp', 720: cdn + 'image/m.webp'}, poster: cdn + 'poster.webp'},
    fallbackRenditions: {video: {360: s3 + 'video/360.mp4', 720: s3 + 'video/720.mp4'},
      image: {360: s3 + 'image/s.webp', 720: s3 + 'image/m.webp'}, poster: s3 + 'poster.webp'},
  };
  it('uses the exact matching rendition, never a different video quality or photo size', () => {
    expect(chat2MatchedS3Variant(cdn + 'video/720.mp4', response)).toBe(s3 + 'video/720.mp4');
    expect(chat2MatchedS3Variant(cdn + 'image/s.webp', response)).toBe(s3 + 'image/s.webp');
    expect(chat2MatchedS3Variant(cdn + 'poster.webp', response)).toBe(s3 + 'poster.webp');
    expect(chat2MatchedS3Variant('https://other.example/item', response)).toBeNull();
  });
  it.each([410,500,502,503,504])('allows S3 for CDN HTTP %s', async status => {
    const http = vi.fn(async () => ({ status }) as Response);
    expect(await chat2CdnS3FailoverAllowed(cdn + 'video/360.mp4', s3 + 'video/360.mp4',
      http as never)).toBe(true);
    expect(http).toHaveBeenCalledWith(cdn + 'video/360.mp4',
      expect.objectContaining({method:'HEAD',credentials:'omit',redirect:'error'}));
  });
  it.each([200,403,404,408,429])('denies fallback on CDN HTTP %s', async status => {
    expect(await chat2CdnS3FailoverAllowed(cdn + 'video/360.mp4', s3 + 'video/360.mp4',
      (async () => ({ status }) as Response) as never)).toBe(false);
  });
  it('refuses different keys, public hosts, malformed URLs, and network/CORS failures', async () => {
    const http = vi.fn(async () => {throw new TypeError('Network failed');});
    for (const [from,to] of [
      [cdn+'image/s.webp',s3+'image/m.webp'],
      ['https://unknown.example/'+root+'video/360.mp4',s3+'video/360.mp4'],
      [cdn+'video/360.mp4','https://other.s3.cloud.ru/'+root+'video/360.mp4'],
      [cdn+'video/360.mp4?token=foo',s3+'video/360.mp4'],
      [cdn+'video/360.mp4',s3+'video/360.mp4?token=foo'],
    ]) expect(await chat2CdnS3FailoverAllowed(from,to,http as never)).toBe(false);
    expect(await chat2CdnS3FailoverAllowed(cdn+'video/360.mp4',s3+'video/360.mp4',
      http as never)).toBe(false);
  });
});
