/** Bounded, read-only MP4 sample-table inspection for avoiding redundant mobile
 * H264/AAC exports. It never reads the video mdat into JS memory. Unknown,
 * fragmented and malformed files are NOT treated as compliant. The server
 * remains the final ffprobe/video decoder authority after S3 upload.
 */
export type Mp4RangeReader = {
  readonly size: number;
  read(offset: number, length: number): Uint8Array;
};
type Box = { type: string; start: number; content: number; end: number };
type Track = { kind: string; codec: string; width: number; height: number;
  timescale: number; samples: number; ticks: number; maxFps: number; bytes: number;
  rotated: boolean };
export type MobileMp4Probe = {
  videoCodec: string; audioCodec: string | null; width: number; height: number;
  fpsMax: number; seconds: number; videoBitrate: number; audioBitrate: number;
  rotated: boolean;
};

function uint(bytes: Uint8Array, start: number): number {
  if (start < 0 || start + 4 > bytes.byteLength) throw Error('MP4_TRUNCATED');
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(start, false);
}
function ascii(bytes: Uint8Array, start: number, size: number): string {
  if (start < 0 || start + size > bytes.length) throw Error('MP4_TRUNCATED');
  return String.fromCharCode(...bytes.subarray(start, start + size));
}
function read(reader: Mp4RangeReader, offset: number, length: number): Uint8Array {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || length < 0 ||
    length > 1_048_576 || offset < 0 || offset + length > reader.size) throw Error('MP4_OUT_OF_BOUNDS');
  const bytes = reader.read(offset, length);
  if (bytes.length !== length) throw Error('MP4_SHORT_READ');
  return bytes;
}
function scan(reader: Mp4RangeReader, start: number, end: number): Box[] {
  const output: Box[] = [];
  let position = start;
  while (position < end) {
    if (output.length >= 100_000 || end - position < 8) throw Error('MP4_BOXES');
    const header = read(reader, position, Math.min(16, end - position));
    const standard = uint(header, 0);
    const type = ascii(header, 4, 4);
    let headerSize = 8;
    let size = standard;
    if (standard === 1) {
      if (header.length < 16) throw Error('MP4_LARGE_HEADER');
      size = Number(new DataView(header.buffer, header.byteOffset, header.byteLength).getBigUint64(8, false));
      headerSize = 16;
    } else if (standard === 0) size = end - position;
    if (!Number.isSafeInteger(size) || size < headerSize || position + size > end)
      throw Error('MP4_BOX_SIZE');
    output.push({type,start:position,content:position+headerSize,end:position+size});
    position += size;
  }
  return output;
}
function child(reader: Mp4RangeReader, box: Box, type: string): Box | undefined {
  return scan(reader,box.content,box.end).find(item=>item.type===type);
}
function required(reader: Mp4RangeReader, box: Box, type: string): Box {
  const result = child(reader,box,type);
  if (!result) throw Error('MP4_MISSING_'+type);
  return result;
}
function sampleTable(reader: Mp4RangeReader, box: Box, track: Track): void {
  const stsd=required(reader,box,'stsd');
  const head=read(reader,stsd.content,Math.min(64,stsd.end-stsd.content));
  if (head.length<16 || uint(head,4)!==1)throw Error('MP4_TRACK_FORMAT');
  const entrySize=uint(head,8);
  if(entrySize<8 || stsd.content+8+entrySize>stsd.end)throw Error('MP4_SAMPLE_ENTRY');
  track.codec=ascii(head,12,4);
  if(track.kind==='vide') {
    if (entrySize<36 || head.length<36)throw Error('MP4_VIDEO_SAMPLE_ENTRY');
    const view=new DataView(head.buffer,head.byteOffset,head.byteLength);
    track.width=view.getUint16(8+32,false);
    track.height=view.getUint16(8+34,false);
  }
  const stts=required(reader,box,'stts');
  const countHead=read(reader,stts.content,8);
  const entryCount=uint(countHead,4);
  if(entryCount<=0 || entryCount>10_000 || stts.content+8+entryCount*8>stts.end)
    throw Error('MP4_BAD_STTS');
  for(let i=0;i<entryCount;i++) {
    const entry=read(reader,stts.content+8+i*8,8);
    const samples=uint(entry,0),delta=uint(entry,4);
    if(!samples || !delta)throw Error('MP4_BAD_FRAME_TIMING');
    track.samples+=samples;
    track.ticks+=samples*delta;
    track.maxFps=Math.max(track.maxFps,track.timescale/delta);
  }
  const stsz=required(reader,box,'stsz');
  const sizesHead=read(reader,stsz.content,12);
  const commonSize=uint(sizesHead,4);
  const count=uint(sizesHead,8);
  if(count!==track.samples || count<=0 || count>100_000)throw Error('MP4_SAMPLE_COUNT');
  if(commonSize)track.bytes=commonSize*count;
  else {
    if(stsz.content+12+count*4>stsz.end)throw Error('MP4_MISSING_SAMPLE_SIZES');
    for(let i=0;i<count;i+=4096){
      const batch=read(reader,stsz.content+12+i*4,Math.min(4096,count-i)*4);
      for(let j=0;j<batch.length;j+=4)track.bytes+=uint(batch,j);
    }
  }
}
function trackInfo(reader: Mp4RangeReader, trak: Box): Track {
  const track:Track={kind:'',codec:'',width:0,height:0,timescale:0,samples:0,ticks:0,maxFps:0,bytes:0,rotated:false};
  const tkhd=required(reader,trak,'tkhd');
  // Rotation is kept only if the affine matrix is the default identity.
  const header=read(reader,tkhd.content,Math.min(112,tkhd.end-tkhd.content));
  const version=header[0];
  const matrixAt=version===1?52:40;
  if(header.length<matrixAt+36)throw Error('MP4_TKHD');
  const a=uint(header,matrixAt),b=uint(header,matrixAt+4),c=uint(header,matrixAt+12),d=uint(header,matrixAt+16);
  track.rotated=a!==65536||b!==0||c!==0||d!==65536;
  const mdia=required(reader,trak,'mdia');
  const hdlr=required(reader,mdia,'hdlr');
  const handler=read(reader,hdlr.content,12);
  track.kind=ascii(handler,8,4);
  const mdhd=required(reader,mdia,'mdhd');
  const meta=read(reader,mdhd.content,mdhd.end-mdhd.content>48?48:mdhd.end-mdhd.content);
  track.timescale=uint(meta,meta[0]===1?20:12);
  if(!track.timescale)throw Error('MP4_TIMESCALE');
  const minf=required(reader,mdia,'minf');
  sampleTable(reader,required(reader,minf,'stbl'),track);
  return track;
}

export function inspectMp4Upload(reader: Mp4RangeReader): MobileMp4Probe | null {
  try {
    if(!Number.isSafeInteger(reader.size)||reader.size<256||reader.size>200*1024*1024)return null;
    const root=scan(reader,0,reader.size);
    if(root[0]?.type!=='ftyp'||root.some(box=>box.type==='moof'))return null;
    const brand=ascii(read(reader,root[0].content,4),0,4);
    if(!['isom','iso2','iso6','mp41','mp42','avc1','M4V ','MSNV'].includes(brand))return null;
    const moov=root.find(box=>box.type==='moov');
    const mediaBytes=root.filter(box=>box.type==='mdat').reduce((sum,box)=>sum+box.end-box.content,0);
    if(!moov || mediaBytes<=0)return null;
    const all=scan(reader,moov.content,moov.end).filter(box=>box.type==='trak')
      .map(box=>trackInfo(reader,box));
    const videos=all.filter(track=>track.kind==='vide');
    const audios=all.filter(track=>track.kind==='soun');
    if(videos.length!==1||audios.length>1||all.length!==videos.length+audios.length)return null;
    const v=videos[0]!,a=audios[0];
    if(!['avc1','avc3'].includes(v.codec)||(a&&a.codec!=='mp4a'))return null;
    if(!v.width||!v.height||v.samples<2||v.ticks<=0||v.bytes<=0 ||
      v.bytes+(a?.bytes??0)>mediaBytes)return null;
    const seconds=v.ticks/v.timescale;
    return {videoCodec:'h264',audioCodec:a?'aac':null,width:v.width,height:v.height,
      fpsMax:v.maxFps,seconds,videoBitrate:v.bytes*8/seconds,
      audioBitrate:a?a.bytes*8/(a.ticks/a.timescale):0,rotated:v.rotated};
  }catch{return null;}
}

export function canReuseMobile720(input: MobileMp4Probe | null): boolean {
  return !!input && input.videoCodec==='h264' && (input.audioCodec===null||input.audioCodec==='aac') &&
    input.width>0 && input.height>0 && Math.min(input.width,input.height)<=720 &&
    input.seconds>0 && input.seconds<=120 &&
    Number.isFinite(input.fpsMax) && input.fpsMax>0 && input.fpsMax<=30.05 &&
    Number.isFinite(input.videoBitrate) && input.videoBitrate>0 && input.videoBitrate<=1_900_000 &&
    Number.isFinite(input.audioBitrate) && input.audioBitrate<=128_000 &&
    !input.rotated;
}
