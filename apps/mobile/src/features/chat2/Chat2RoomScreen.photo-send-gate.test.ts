import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = ["Chat2RoomScreen.tsx", "Chat2RoomComposer.tsx", "chat2RoomStyles.ts", "Chat2RoomMedia.tsx"].map(file => readFileSync(new URL("./" + file, import.meta.url), "utf8")).join("\n");
const prepare = source.slice(source.indexOf("async function prepareOnePhoto("),
  source.indexOf("async function prepareOneVideo("));
const send = source.slice(source.indexOf("async function send()"),
  source.indexOf("const retry = useRef<"));

describe("Chat 2.0 photo upload consent gate", () => {
  it("allows selecting multiple images up to the remaining ten slots", () => {
    expect(source).toContain('allowsMultipleSelection: kind === "image"');
    expect(source).toContain('selectionLimit: 10 - media.length');
    expect(source).toContain('selection.assets.slice(0, 10 - media.length)');
  });
  it("keeps attachment previews directly above the composer without growing into the chat", () => {
    expect(source).toMatch(/mediaPending:\s*\{[^}]*flexGrow:\s*0[^}]*flexShrink:\s*0/);
    expect(source.indexOf("style={styles.mediaPending}")).toBeLessThan(
      source.indexOf("<Chat2RoomComposer"));
  });
  it("encodes both WebP sizes before sending, without network side effects", () => {
    expect(prepare).toContain("prepareUploadPhoto(source)");
    expect(prepare).toContain("prepareUploadWebpVariants(prepared, { small: 360, medium: 1440 })");
    expect(prepare).not.toContain("chat2.upload(");
    expect(prepare).not.toContain("client-reserve");
    expect(source).toContain("await prepareOnePhoto(localId, photo)");
    expect(source).toContain("Готово к отправке");
  });
  it("uploads only from the send handler, then sends confirmed attachments", () => {
    const photoStart = send.indexOf("if (!file.sourcePhoto) continue;");
    const idsStart = send.indexOf("const attachmentIds = confirmed.flatMap(");
    const messageSend = send.match(/await\s+measureMobileOperation\(\s*"CHAT_SEND",\s*\(\)\s*=>\s*chat2\.send\(id, value, attempt\.clientMessageId, reply\?\.id, attachmentIds\)\s*\)/);
    expect(photoStart).toBeGreaterThanOrEqual(0);
    expect(idsStart).toBeGreaterThan(photoStart);
    expect(messageSend).not.toBeNull();
    expect(idsStart).toBeLessThan(messageSend!.index!);
    const photo = send.slice(photoStart, idsStart);
    expect(photo).toMatch(/if \(!variants\) throw new Error/);
    expect(photo).toMatch(/const attachment = await chat2\.upload\(id, \{\s*uri: variants\.medium\.uri/);
    expect(photo).toContain("preparedVariants: variants");
    expect(photo).toContain("confirmed[index] = { ...file, attachment, failure: undefined }");
    expect(photo).toContain("setMedia(previous => previous.map(item =>");
    expect(photo).toContain("item.localId === file.localId");
    expect(photo).toContain("? { ...item, attachment, failure: undefined } : item");
    expect(photo).toMatch(/catch \(cause\) \{[\s\S]*throw cause;/);
    expect(send).toContain("confirmed.flatMap(file => file.attachment ? [file.attachment.id] : [])");
    expect(send).toContain("if (file.attachment) continue;");
    expect(send).toContain("media.some(file => !file.attachment && !file.preparedPhoto && !file.preparedVideo)) return;");
    expect(send).toContain("sendingRef.current = true");
    expect(source).toContain("onSend={() => void send()}");
  });
  it("retains retries and releases temporary encodes on cancel/unmount/success", () => {
    expect(source).toContain("activePhotos.current.delete(file.localId)");
    expect(source).toContain("preparedPhotos.current.delete(file.localId)");
    expect(source).toContain("preparedPhotos.current.clear()");
    expect(source).toContain("if (pending) return;");
    expect(source).toContain("retryOnePhoto(file.localId)");
  });
});
