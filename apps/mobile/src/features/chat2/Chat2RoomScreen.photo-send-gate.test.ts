import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Chat2RoomScreen.tsx", import.meta.url), "utf8");
const prepare = source.slice(source.indexOf("async function prepareOnePhoto("),
  source.indexOf("async function prepareOneVideo("));
const send = source.slice(source.indexOf("async function send()"),
  source.indexOf("const retry = useRef<"));

describe("Chat 2.0 photo upload consent gate", () => {
  it("encodes both WebP sizes before sending, without network side effects", () => {
    expect(prepare).toContain("prepareUploadPhoto(source)");
    expect(prepare).toContain("prepareUploadWebpVariants(prepared, { small: 360, medium: 1440 })");
    expect(prepare).not.toContain("chat2.upload(");
    expect(prepare).not.toContain("client-reserve");
    expect(source).toContain("await prepareOnePhoto(localId, f)");
    expect(source).toContain("Готово к отправке");
  });
  it("uploads only from the send handler, then sends confirmed attachments", () => {
    expect(send).toContain("const attachment = await chat2.upload(id, {");
    expect(send.indexOf("const attachment = await chat2.upload(id, {")).toBeLessThan(
      send.indexOf("else await chat2.send(id, value, requestId, reply?.id, attachmentIds)"));
    expect(send).toContain("if (!file.sourcePhoto) continue;");
    expect(send).toContain("preparedVariants: variants");
    expect(send).toContain("setMedia(previous => previous.map(item =>");
    expect(send).toContain("item.localId === file.localId");
    expect(send).toContain("sendingRef.current = true");
  });
  it("retains retries and releases temporary encodes on cancel/unmount/success", () => {
    expect(source).toContain("activePhotos.current.delete(file.localId)");
    expect(source).toContain("preparedPhotos.current.delete(file.localId)");
    expect(source).toContain("preparedPhotos.current.clear()");
    expect(source).toContain("if (pending) return;");
    expect(source).toContain("retryOnePhoto(file.localId)");
  });
});
