/** Physical 120-second video against current Feed Cloud source only. No API or production writes. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, chmod, readFile, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { processFeedVideoFile, FEED_VIDEO_MAX_SECONDS, parseFeedHlsPlaylist } from "../../packages/feed-cloud/src/index.ts";
const execFileAsync=promisify(execFile);
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const SCRATCH=join(ROOT,".local-pg-scratch","nonprod-s3");
async function main(){
  if(process.env.WEB4_VIDEO_120_SOURCE_REAL!=="1" || process.cwd()!==ROOT ||
    await realpath(ROOT)!==ROOT || await realpath(SCRATCH)!==SCRATCH || FEED_VIDEO_MAX_SECONDS!==120)
    throw Error("SOURCE_ONLY_120S_ACCEPTANCE_DENIED");
  const own=await mkdtemp(join(SCRATCH,"web4-120-hls-source-"));
  if(!own.startsWith(SCRATCH+"/"))throw Error("OUTSIDE_SCRATCH");
  try{
    const input=join(own,"synthetic-120.mp4");
    await execFileAsync("/opt/homebrew/bin/ffmpeg",[
      "-hide_banner","-nostdin","-loglevel","error","-y",
      "-f","lavfi","-i","testsrc2=size=160x96:rate=5", "-t","120",
      "-c:v","libx264","-pix_fmt","yuv420p","-preset","ultrafast",
      "-movflags","+faststart",input,
    ],{timeout:60000,maxBuffer:64*1024});
    await chmod(input,0o600);
    const result=await processFeedVideoFile(input,own);
    if(result.info.durationSeconds<119.5 || result.info.durationSeconds>120 ||
       !result.segments.length || result.segments.length>90)throw Error("SOURCE_120S_HLS_INVALID_RESULT");
    const playlist=await readFile(result.playlist,"utf8");
    const names=parseFeedHlsPlaylist(playlist);
    if(names.length!==result.segments.length || !playlist.includes("#EXT-X-ENDLIST"))
      throw Error("SOURCE_120S_PLAYLIST_INVALID");
    const poster=await readFile(result.poster);
    if(poster.subarray(0,4).toString("ascii")!=="RIFF")throw Error("SOURCE_120S_POSTER_INVALID");
    for(const segment of result.segments){
      const file=await readFile(segment.path);
      if(file.byteLength!==segment.bytes || file[0]!==0x47)throw Error("SOURCE_120S_TS_INVALID");
    }
    console.warn(`WEB4_REAL_120_SECOND_FFMPEG_HLS_SOURCE_PASS duration=${result.info.durationSeconds} segments=${names.length} posterWebP=true TS=true`);
  }finally{
    await rm(own,{recursive:true,force:false});
    console.warn("WEB4_REAL_120_SECOND_OWN_TEMP_CLEANUP_PASS");
  }
}
void main().catch(()=>{console.error("WEB4_REAL_120_SECOND_SOURCE_ACCEPTANCE_FAILED");process.exitCode=1;});
