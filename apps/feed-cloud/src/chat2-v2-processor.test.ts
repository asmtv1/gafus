import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chat2V2SourceKey, chat2V2FinalKeys, type Chat2V2Job } from "@gafus/feed-cloud";
import { processChat2V2Asset, type Chat2V2Objects } from "./chat2-v2-processor";

const directories: string[] = [];
const root = fileURLToPath(new URL("../", import.meta.url));
afterEach(async () => {for(const dir of directories.splice(0))await rm(dir,{recursive:true,force:true});});
async function temp() {const dir=await mkdtemp(join(root,".chat2-video-only-test-"));directories.push(dir);return dir;}
const webp=()=>new Uint8Array([82,73,70,70,12,0,0,0,87,69,66,80,1,2,3,4,5,6]);
const job=(mime:Chat2V2Job["sourceMime"]="video/mp4"):Chat2V2Job=>{
  const conversationId="room_1",ownerId="actor_1",mediaId=randomUUID();
  return {conversationId,ownerId,mediaId,sourceMime:mime,sourceBytes:1000,
    sourceKey:chat2V2SourceKey(conversationId,ownerId,mediaId,mime)};
};
function objects() {
  const uploaded=new Map<string,Uint8Array>();
  const api:Chat2V2Objects={
    download:vi.fn(async (_key,file)=>{await writeFile(file,new Uint8Array(100));}),
    create:vi.fn(async(key,bytes)=>{uploaded.set(key,bytes);}),
    createFile:vi.fn(async(key,file)=>{uploaded.set(key,await readFile(file));}),
  };
  return {api,uploaded};
}
function fake360() {
  return vi.fn(async (_source:string,dir:string) => {
    const poster=join(dir,"poster.webp"),path=join(dir,"360.mp4");
    await writeFile(poster,webp());await writeFile(path,new Uint8Array(80));
    return {info:{width:1280,height:720,durationSeconds:30,rotated:false,hdr:false,hasAudio:true},
      poster,mp4:[{quality:360 as const,path,width:640,height:360,bytes:80}]};
  });
}
const deps=(api:Chat2V2Objects,processVideo:ReturnType<typeof fake360>)=>({
  objects:api,engine:{} as never,processVideo:processVideo as never,
});

describe("Chat2 Cloud.ru only enriches READY 720p with optional 360p; poster is client-produced",()=>{
  it("rejects ALL image and original-source video Jobs before S3 access",async()=>{
    const dir=await temp(),{api}=objects();
    for(const mime of ["image/jpeg","image/webp","video/quicktime","video/mp4"] as const) {
      const input=job(mime);
      await expect(processChat2V2Asset(input,dir,deps(api,fake360()),new AbortController().signal))
        .rejects.toThrow("CHAT2_CLOUD_BACKGROUND_360_ONLY");
    }
    expect(api.download).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.createFile).not.toHaveBeenCalled();
  });
  it("downloads immutable 720p, creates ONLY 360p, never uploads 720p or another poster",async()=>{
    const dir=await temp(),{api,uploaded}=objects(),video=fake360();
    const input={...job(),phase:"background_360" as const};
    const keys=chat2V2FinalKeys(input.conversationId,input.ownerId,input.mediaId);
    const result=await processChat2V2Asset(input,dir,deps(api,video),new AbortController().signal);
    expect(api.download).toHaveBeenCalledExactlyOnceWith(keys.video.variants[720],
      expect.any(String),200*1024*1024,expect.anything());
    expect(video).toHaveBeenCalledWith(expect.any(String),dir,expect.any(Function),[360],
      expect.objectContaining({firstPlayableOnly:false,skipPoster:true,
        reuseClient720IfValid:false,sharedDecode:false,parallelRenditions:false}));
    expect(result.kind).toBe("video");
    if(result.kind!=="video")throw Error("BAD_TEST_MANIFEST");
    expect(result.renditions.map(x=>x.quality)).toEqual([360]);
    expect(result.posterKey).toBeUndefined();
    expect([...uploaded.keys()].sort()).toEqual([keys.video.variants[360]]);
    expect(uploaded.has(keys.video.variants[720])).toBe(false);
  });
  it("rejects unexpected 720p result without starting any upload",async()=>{
    const dir=await temp(),{api}=objects(),video=fake360();
    video.mockImplementationOnce(async (_source,dir)=>{
      const poster=join(dir,"poster.webp"),path=join(dir,"720.mp4");
      await writeFile(poster,webp());await writeFile(path,new Uint8Array(80));
      return {info:{width:1280,height:720,durationSeconds:30,rotated:false,hdr:false,hasAudio:true},
        poster,mp4:[{quality:720 as never,path,width:1280,height:720,bytes:80}]};
    });
    await expect(processChat2V2Asset({...job(),phase:"background_360"},dir,deps(api,video),new AbortController().signal))
      .rejects.toThrow("CHAT2_CLOUD_UNEXPECTED_VIDEO_RENDITION");
    expect(api.create).not.toHaveBeenCalled();expect(api.createFile).not.toHaveBeenCalled();
  });
  it("does not report a finished manifest on partially failed S3 upload",async()=>{
    const dir=await temp(),{api}=objects();
    api.createFile=vi.fn(async()=>{throw Error("S3_UNAVAILABLE")});
    await expect(processChat2V2Asset({...job(),phase:"background_360"},dir,
      deps(api,fake360()),new AbortController().signal)).rejects.toThrow("S3_UNAVAILABLE");
    expect(api.create).not.toHaveBeenCalled();expect(api.createFile).toHaveBeenCalledOnce();
  });
  it("rejects forged foreign-room source identity before any S3 access",async()=>{
    const dir=await temp(),{api}=objects(),input=job();
    await expect(processChat2V2Asset({...input,phase:"background_360",
      sourceKey:input.sourceKey.replace("room_1","room_2")},dir,
      deps(api,fake360()),new AbortController().signal))
      .rejects.toThrow("CHAT2_V2_UNTRUSTED_SOURCE_KEY");
    expect(api.download).not.toHaveBeenCalled();
  });
});
