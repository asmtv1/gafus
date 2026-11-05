import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearMp4Experience, mp4NetworkKey, recentMp4Performance,
  rememberMp4Startup, selectMp4Quality,
} from './video-playback-quality.js';

beforeEach(() => clearMp4Experience());

describe('MP4 shared auto quality policy', () => {
  it('uses 720p on fast Wi-Fi, ethernet, fast 4G/5G and known high throughput', () => {
    expect(selectMp4Quality('auto', {width:220, connectionType:'wifi'})).toBe(720);
    expect(selectMp4Quality('auto', {width:220, connectionType:'ethernet'})).toBe(720);
    expect(selectMp4Quality('auto', {width:220, cellularGeneration:'4g'})).toBe(720);
    expect(selectMp4Quality('auto', {width:220, cellularGeneration:'5g'})).toBe(720);
    expect(selectMp4Quality('auto', {width:220, downlinkMbps:5})).toBe(720);
  });
  it('prioritizes saving data, slow estimates and recent stalls', () => {
    expect(selectMp4Quality('auto', {width:900, connectionType:'wifi', saveData:true})).toBe(360);
    expect(selectMp4Quality('auto', {width:900, cellularGeneration:'5g', metered:true})).toBe(720);
    expect(selectMp4Quality('auto', {width:900, connectionType:'cellular', metered:true})).toBe(360);
    expect(selectMp4Quality('auto', {width:900, connectionType:'wifi', downlinkMbps:1.5})).toBe(360);
    expect(selectMp4Quality('auto', {width:900, effectiveType:'3g'})).toBe(360);
    expect(selectMp4Quality('auto', {width:900, cellularGeneration:'2g'})).toBe(360);
    expect(selectMp4Quality('auto', {width:900, connectionType:'wifi', recentPerformance:'poor'})).toBe(360);
  });
  it('uses display pixels and same-network successful 720p starts when estimates are unknown', () => {
    expect(selectMp4Quality('auto', {width:220, devicePixelRatio:2})).toBe(360);
    expect(selectMp4Quality('auto', {width:400, devicePixelRatio:2})).toBe(720);
    expect(selectMp4Quality('auto', {width:220, devicePixelRatio:2, recentPerformance:'good'})).toBe(720);
    expect(selectMp4Quality('auto', {width:100, devicePixelRatio:2, recentPerformance:'good'})).toBe(360);
    expect(selectMp4Quality('auto', {width:NaN})).toBe(360);
  });
  it('respects manual choice over network costs and never infers a missing quality', () => {
    expect(selectMp4Quality(720,{width:220,saveData:true,connectionType:'unknown'})).toBe(720);
    expect(selectMp4Quality(360,{width:1080,connectionType:'wifi'})).toBe(360);
  });
  it('learns two fast starts, resets on stalls and expires in 10 minutes', () => {
    const key = mp4NetworkKey({width:220,connectionType:'wifi'});
    const other = mp4NetworkKey({width:220,connectionType:'cellular'});
    rememberMp4Startup(key,720,900,1000);
    expect(recentMp4Performance(key,1200)).toBeUndefined();
    rememberMp4Startup(key,720,1000,1300);
    expect(recentMp4Performance(key,1500)).toBe('good');
    expect(recentMp4Performance(other,1500)).toBeUndefined();
    rememberMp4Startup(key,360,5000,1600);
    expect(recentMp4Performance(key,1700)).toBe('poor');
    expect(recentMp4Performance(key,610_000)).toBeUndefined();
  });
});
