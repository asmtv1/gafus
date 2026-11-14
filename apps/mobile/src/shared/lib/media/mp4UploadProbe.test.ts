import { describe, expect, it } from 'vitest';
import { canReuseMobile720, canAcceptEncodedMobile720, canAcceptAndroidServer720, inspectMp4Upload } from './mp4UploadProbe';

const u16=(n:number)=>[(n>>>8)&255,n&255];
const u32=(n:number)=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const text=(s:string)=>Array.from(s).map(x=>x.charCodeAt(0));
const bytes=(...values:(number[]|Uint8Array)[])=>Uint8Array.from(values.flatMap(value=>Array.from(value)));
function box(name:string,data:Uint8Array):Uint8Array {
  return bytes(u32(data.length+8),text(name),data);
}
function trak(kind:'vide'|'soun',codec:string,fps:number,large=false):Uint8Array {
  const sampleCount=kind==='vide'?fps:48;
  const sampleDelta=kind==='vide'?Math.round(15_360/fps):1024;
  const trackSize=kind==='vide'?(large?8_000:5_000):200;
  const tkhdData=new Uint8Array(80);
  tkhdData.set(u32(65536),40);tkhdData.set(u32(65536),56);
  const mdhdData=new Uint8Array(24);
  mdhdData.set(u32(kind==='vide'?15360:48000),12);
  const hdlrData=new Uint8Array(12);hdlrData.set(text(kind),8);
  const sampleEntry=new Uint8Array(36);sampleEntry.set(u32(36),0);sampleEntry.set(text(codec),4);
  if(kind==='vide'){
    sampleEntry.set(u16(1280),32);sampleEntry.set(u16(720),34);
  }
  const stsd=box('stsd',bytes([0,0,0,0],u32(1),sampleEntry));
  const stts=box('stts',bytes([0,0,0,0],u32(1),u32(sampleCount),u32(sampleDelta)));
  const stsz=box('stsz',bytes([0,0,0,0],u32(trackSize),u32(sampleCount)));
  const stbl=box('stbl',bytes(stsd,stts,stsz));
  const minf=box('minf',stbl);
  const mdia=box('mdia',bytes(box('mdhd',mdhdData),box('hdlr',hdlrData),minf));
  return box('trak',bytes(box('tkhd',tkhdData),mdia));
}
function metadataTrack():Uint8Array {
  // iOS exports may carry timed metadata that has no media sample table.
  const hdlrData=new Uint8Array(12);hdlrData.set(text('meta'),8);
  const tkhdData=new Uint8Array(80);tkhdData.set(u32(65536),40);tkhdData.set(u32(65536),56);
  return box('trak',bytes(box('tkhd',tkhdData),box('mdia',box('hdlr',hdlrData))));
}
function mp4(fps=30,codec='avc1',large=false,metadata=false):Uint8Array {
  const ftyp=box('ftyp',bytes(text('isom'),u32(0),text('iso2')));
  const moov=box('moov',bytes(trak('vide',codec,fps,large),trak('soun','mp4a',48),...(metadata?[metadataTrack()]:[])));
  const data=box('mdat',new Uint8Array(fps*(large?8000:5000)+48*200));
  return bytes(ftyp,moov,data);
}
function inspect(bytes:Uint8Array){
  return inspectMp4Upload({size:bytes.byteLength,read:(offset,length)=>bytes.subarray(offset,offset+length)});
}

describe('bounded native MP4 sample-table validator',()=>{
  it('accepts 30 FPS H264/AAC while measuring real sample sizes',()=>{
    const good=inspect(mp4());
    expect(good).toMatchObject({videoCodec:'h264',audioCodec:'aac',width:1280,height:720,fpsMax:30});
    expect(good?.videoBitrate).toBe(1_200_000);
    expect(canReuseMobile720(good)).toBe(true);
  });
  it('allows small Android MediaCodec 30.2 FPS timestamp rounding but not sustained high FPS',()=>{
    const encoded=mp4();
    const stts=encoded.findIndex((_,i)=> i+4<=encoded.length &&
      encoded[i]===115 && encoded[i+1]===116 && encoded[i+2]===116 && encoded[i+3]===115);
    expect(stts).toBeGreaterThan(0);
    // 15360 / 509 = 30.177 FPS; native encoders commonly round STTS deltas.
    encoded.set(u32(509), stts+16);
    const metadata=inspect(encoded);
    expect(metadata?.fpsMax).toBeGreaterThan(30);
    expect(metadata?.fpsAverage).toBeGreaterThan(30);
    expect(canAcceptEncodedMobile720(metadata)).toBe(true);
    expect(canReuseMobile720(metadata)).toBe(true);
    const sustained60=inspect(mp4(60));
    expect(canAcceptEncodedMobile720(sustained60)).toBe(false);
  });
  it('enforces production server limits for Android encoded MP4',()=>{
    const good=inspect(mp4());
    expect(canAcceptAndroidServer720(good)).toBe(true);
    expect(canAcceptAndroidServer720({...good!,fpsMax:30.15})).toBe(false);
    expect(canAcceptAndroidServer720({...good!,videoBitrate:1_900_001})).toBe(false);
    expect(canAcceptAndroidServer720({...good!,audioBitrate:128_001})).toBe(false);
    expect(canAcceptAndroidServer720({...good!,rotated:true})).toBe(false);
    expect(canAcceptAndroidServer720({...good!,videoCodec:'hevc'})).toBe(false);
  });
  it('fails closed on 60 FPS, HEVC and excessive source bitrate',()=>{
    const fast=inspect(mp4(60));
    expect(fast?.fpsMax).toBe(60);
    expect(canReuseMobile720(fast)).toBe(false);
    expect(inspect(mp4(30,'hvc1'))).toBeNull();
    expect(canReuseMobile720(inspect(mp4(30,'avc1',true)))).toBe(false);
  });
  it('ignores iOS timed metadata tracks without skipping audio/video validation',()=>{
    const withMetadata=inspect(mp4(30,'avc1',false,true));
    expect(withMetadata).toMatchObject({videoCodec:'h264',audioCodec:'aac',width:1280,height:720});
    expect(canReuseMobile720(withMetadata)).toBe(true);
    expect(inspect(mp4(30,'hvc1',false,true))).toBeNull();
    const reasons:string[]=[];
    const unsupported=mp4(30,'hvc1');
    inspectMp4Upload({size:unsupported.byteLength,read:(o,n)=>unsupported.subarray(o,o+n)},reason=>reasons.push(reason));
    expect(reasons).toEqual(['MP4_CODECS_Vhvc1_Amp4a']);
  });
  it('accepts valid iOS rotation metadata and safe encoder bitrate overshoot',()=>{
    const sample=inspect(mp4());
    expect(sample).not.toBeNull();
    const rotated={...sample!,rotated:true};
    expect(canReuseMobile720(rotated)).toBe(true);
    const shortClip={...rotated,videoBitrate:2_100_000,audioBitrate:145_000};
    expect(canReuseMobile720(shortClip)).toBe(false);
    expect(canAcceptEncodedMobile720(shortClip)).toBe(true);
    expect(canAcceptEncodedMobile720({...shortClip,fpsMax:60})).toBe(false);
    expect(canAcceptEncodedMobile720({...shortClip,videoCodec:'hevc'})).toBe(false);
    expect(canAcceptEncodedMobile720({...shortClip,videoBitrate:4_000_000})).toBe(false);
  });
  it('refuses truncated files, forged box size, missing mdat or declared byte counts',()=>{
    const good=mp4();
    expect(inspect(good.subarray(0,128))).toBeNull();
    const forged=good.slice();forged.set(u32(0xfffffff0),0);
    expect(inspect(forged)).toBeNull();
    const noData=good.subarray(0,good.length-159608);
    expect(inspect(noData)).toBeNull();
    const invalidBrand=good.slice();invalidBrand.set(text('qt  '),8);
    expect(inspect(invalidBrand)).toBeNull();
  });
});
