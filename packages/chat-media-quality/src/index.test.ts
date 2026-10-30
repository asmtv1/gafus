import { describe, expect, it } from 'vitest';
import { chat2ImageQuality, chat2ImageSource, chat2VideoQuality, chat2VideoSource, chat2HasVideoQuality } from './index.js';
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
