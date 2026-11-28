import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=["Chat2RoomScreen.tsx", "Chat2RoomComposer.tsx", "chat2RoomStyles.ts", "Chat2RoomMedia.tsx"].map(file => readFileSync(new URL("./" + file, import.meta.url), "utf8")).join("\n");
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
    const videoStart = send.indexOf("if (file.sourceVideo) {");
    const photoStart = send.indexOf("if (!file.sourcePhoto) continue;");
    const idsStart = send.indexOf("const attachmentIds = confirmed.flatMap(");
    const messageSend = send.match(/await\s+measureMobileOperation\(\s*"CHAT_SEND",\s*\(\)\s*=>\s*chat2\.send\(id, value, attempt\.clientMessageId, reply\?\.id, attachmentIds\)\s*\)/);
    expect(videoStart).toBeGreaterThanOrEqual(0);
    expect(photoStart).toBeGreaterThan(videoStart);
    expect(idsStart).toBeGreaterThan(photoStart);
    expect(messageSend).not.toBeNull();
    expect(idsStart).toBeLessThan(messageSend!.index!);
    const video = send.slice(videoStart, photoStart);
    expect(video).toContain("const prepared = preparedVideos.current.get(file.localId)");
    expect(video).toMatch(/if \(!prepared \|\| !poster\) throw new Error/);
    expect(video).toMatch(/const attachment = await chat2\.upload\(id, \{\s*uri: prepared\.uri/);
    expect(video).toContain("preparedPoster: poster");
    expect(video).toContain("confirmed[index] = { ...file, attachment, failure: undefined }");
    expect(video).toContain("setMedia(previous => previous.map(item =>");
    expect(video).toContain("item.localId === file.localId");
    expect(video).toContain("? { ...item, attachment, failure: undefined } : item");
    expect(video).toMatch(/catch \(cause\) \{[\s\S]*throw cause;/);
    expect(send).toContain("confirmed.flatMap(file => file.attachment ? [file.attachment.id] : [])");
    expect(send).toContain("if (file.attachment) continue;");
    expect(send).toContain("media.some(file => !file.attachment && !file.preparedPhoto && !file.preparedVideo)) return;");
    expect(source).toContain("onSend={() => void send()}");
    expect(send).toContain("preparedVideos.current.clear()");
    expect(source).toContain("preparedVideos.current.get(file.localId)?.dispose()");
    expect(source).toContain("for (const prepared of videoDrafts.values()) prepared.dispose()");
  });
});
