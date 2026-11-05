import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=readFileSync(new URL("./Chat2RoomScreen.tsx",import.meta.url),"utf8");
const prepare=source.slice(source.indexOf("async function prepareOneVideo("),
  source.indexOf("function retryOneVideo("));
const selection=source.slice(source.indexOf("async function pick("),
  source.indexOf("function removeMedia("));
const send=source.slice(source.indexOf("async function send()"),
  source.indexOf("const retry = useRef<"));

describe("Chat2 native video S3 consent gate",()=>{
  it("prepares MP4 once before Send and does not reserve/attach/S3-upload",()=>{
    expect(prepare).toContain("await prepareUploadVideo720(source");
    expect(prepare).toContain("preparedVideos.current.set(localId, prepared)");
    expect(prepare).toContain("await prepareVideoPosterWebp(prepared.uri)");
    expect(prepare).toContain("preparedVideoPosters.current.set(localId, poster)");
    expect(prepare).not.toContain("chat2.upload(");
    expect(selection).toContain("await prepareOneVideo(localId, f)");
    expect(selection).not.toContain("uploadOneVideo(");
  });
  it("uploads prepared local video only from the send handler",()=>{
    expect(send).toContain("const prepared = preparedVideos.current.get(file.localId)");
    expect(send).toContain("const attachment = await chat2.upload(id, {");
    expect(send).toContain("uri: prepared.uri");
    expect(send).toContain("preparedPoster: poster");
    expect(send).toContain("else await chat2.send(id, value, requestId, reply?.id, attachmentIds)");
    expect(send).toContain("preparedVideos.current.clear()");
    expect(source).toContain("preparedVideos.current.get(file.localId)?.dispose()");
    expect(source).toContain("for (const prepared of videoDrafts.values()) prepared.dispose()");
  });
});
