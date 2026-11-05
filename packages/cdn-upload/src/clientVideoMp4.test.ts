import {beforeAll,afterAll,describe,expect,it,vi} from "vitest";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {HeadObjectCommand,GetObjectCommand,CopyObjectCommand} from "@aws-sdk/client-s3";
import {verifyClientMp4,copyVerifiedClientMp4} from "./clientVideoMp4";

const available=spawnSync("ffmpeg",["-version"],{timeout:5000}).status===0;
let root="";
beforeAll(async()=>{root=await mkdtemp(join(tmpdir(),"gafus-verified-mp4-"));});
afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});});

describe.skipIf(!available)("S3 server-side verified H264 720p, no Cloud container",()=>{
  async function source(){
    const path=join(root,"720.mp4");
    const result=spawnSync("ffmpeg",["-nostdin","-hide_banner","-loglevel","error","-y",
      "-f","lavfi","-i","testsrc2=size=640x360:rate=30","-t","2",
      "-c:v","libx264","-threads","2","-preset","veryfast","-b:v","800k",
      "-pix_fmt","yuv420p","-movflags","+faststart",path],{timeout:20000});
    if(result.status!==0)throw Error("TEST_FFMPEG_SOURCE_FAILED:"+result.stderr?.toString().slice(-300));
    return await readFile(path);
  }
  it("only copies an authenticated compatible MP4 after bounded Range validation",async()=>{
    const bytes=await source(),size=bytes.length;
    const etag='"valid-h264"',bucket="gafus-private-test";
    const pending="posts/user/post/incoming/upload/source.mp4";
    const final="media/v2/asset/v1/video/720.mp4";
    const copied=new Map<string,Buffer>();
    const calls:string[]=[];
    const s3={send:vi.fn(async(cmd:unknown)=>{
      if(cmd instanceof HeadObjectCommand){
        calls.push("HEAD:"+cmd.input.Key);
        if(cmd.input.Key===final&&!copied.has(final))throw Error("DEST_NOT_COPIED");
        return {ETag:etag,ContentLength:size,ContentType:"video/mp4"};
      }
      if(cmd instanceof GetObjectCommand){
        calls.push("RANGE:"+cmd.input.Range);
        expect(cmd.input.IfMatch).toBe(etag);
        const match=/^bytes=(\d+)-(\d+)$/.exec(cmd.input.Range??"")!;
        const selected=bytes.subarray(Number(match[1]),Number(match[2])+1);
        return {Body:{transformToByteArray:async()=>new Uint8Array(selected)}};
      }
      if(cmd instanceof CopyObjectCommand){
        calls.push("COPY:"+cmd.input.Key);
        expect(cmd.input.CopySourceIfMatch).toBe(etag);
        expect(cmd.input.Key).toBe(final);
        copied.set(final,bytes);
        return {};
      }
      throw Error("UNEXPECTED_S3_COMMAND");
    })};
    const verified=await verifyClientMp4(s3 as never,bucket,pending,size);
    expect(verified).toMatchObject({width:640,height:360,bytes:size});
    expect(verified.durationSeconds).toBeCloseTo(2,1);
    expect(calls.some(call=>call.startsWith("RANGE:"))).toBe(true);
    await copyVerifiedClientMp4(s3 as never,bucket,pending,final,verified);
    expect(copied.get(final)).toEqual(bytes);
    expect(calls).toContain("COPY:"+final);
  },30000);
  it("rejects HEAD mismatch and damaged MP4 without ever copying",async()=>{
    const invalid=Buffer.alloc(1024,0);
    const send=vi.fn(async(cmd:unknown)=>{
      if(cmd instanceof HeadObjectCommand)return {ETag:'"a"',ContentType:"video/mp4",ContentLength:invalid.length};
      if(cmd instanceof GetObjectCommand)return {Body:{transformToByteArray:async()=>new Uint8Array(invalid)}};
      throw Error("NEVER_COPY_UNVERIFIED_SOURCE");
    });
    await expect(verifyClientMp4({send} as never,"bucket","incoming.mp4",1024))
      .rejects.toThrow("CLIENT_VIDEO_MP4_UNSUPPORTED");
    expect(send.mock.calls.every(([cmd])=>!(cmd instanceof CopyObjectCommand))).toBe(true);
    await expect(verifyClientMp4({send} as never,"bucket","incoming.mp4",2048))
      .rejects.toThrow("CLIENT_VIDEO_S3_HEAD_MISMATCH");
  });
});
