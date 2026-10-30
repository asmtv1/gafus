import { describe, expect, it } from "vitest";
import { chat2SniffMime, chat2ReservePrivateObjectKey } from "../../../../../packages/cdn-upload/src/chat2Media";

const mp4 = Uint8Array.from([
  0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109,
  0, 0, 2, 0, 105, 115, 111, 109, 109, 112, 52, 49,
]);

describe("Chat 2.0 progressive MP4 attachments", () => {
  it("detects MP4 by the file signature and reserves an MP4 S3 key", () => {
    expect(chat2SniffMime(mp4)).toEqual({ mime: "video/mp4", kind: "video", ext: "mp4" });
    const key = chat2ReservePrivateObjectKey("room_1", "user_1", mp4, "video/mp4");
    expect(key).toMatch(/^chat2\/room_1\/user_1\/[a-f0-9-]{36}\.mp4$/);
  });
  it("rejects mislabelled video and unsupported MOV/WebM containers", () => {
    expect(() => chat2ReservePrivateObjectKey("room_1", "user_1", mp4, "image/jpeg"))
      .toThrow("CHAT2_INVALID_CONTENT_TYPE");
    const webm = Uint8Array.from([26, 69, 223, 163, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(chat2SniffMime(webm)).toBeNull();
    const mov = Uint8Array.from([0, 0, 0, 12, 102, 116, 121, 112, 113, 116, 32, 32]);
    expect(chat2SniffMime(mov)).toBeNull();
  });
});
