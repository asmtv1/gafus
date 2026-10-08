import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), upload: vi.fn() }));
vi.mock("@gafus/core/services/cynologistChat", () => ({
  requireCanSend: mocks.access,
  requireCommunityCanSend: mocks.access,
  ChatError: class extends Error {
    constructor(
      public code: string,
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
}));
vi.mock("@gafus/core/services/cynologistChat/upload", () => ({
  uploadChatAttachment: mocks.upload,
}));
import { uploadChatAttachmentRequest } from "./upload";
function request(field = "file", extra = false) {
  const body = new FormData();
  body.append(field, new Blob(["image"], { type: "image/png" }), "photo.png");
  if (extra) body.append("unexpected", "value");
  return new Request("http://localhost/attachments", { method: "POST", body });
}
beforeEach(() => {
  vi.resetAllMocks();
});
describe("multipart adapter", () => {
  it("passes decoded metadata and a temporary file to core, then removes it", async () => {
    let path = "";
    mocks.upload.mockImplementation(async (actor, file, chatId, community) => {
      path = file.path;
      expect(actor).toBe("client");
      expect(chatId).toBe("chat");
      expect(community).toBe(false);
      expect(file).toMatchObject({ name: "photo.png", declaredMime: "image/png" });
      expect(await readFile(path, "utf8")).toBe("image");
      return { id: "attachment" };
    });
    expect(await uploadChatAttachmentRequest("client", request(), "chat")).toEqual({
      id: "attachment",
    });
    expect(existsSync(path)).toBe(false);
  });
  it.each([
    ["arbitrary", false],
    ["file", true],
  ])("rejects unexpected multipart fields", async (field, extra) => {
    await expect(
      uploadChatAttachmentRequest("client", request(field, extra)),
    ).rejects.toMatchObject({ code: "CHAT_INVALID_FILE" });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("checks access before receiving the request body", async () => {
    mocks.access.mockRejectedValueOnce(new Error("banned"));
    await expect(uploadChatAttachmentRequest("client", request(), undefined, true)).rejects.toThrow(
      "banned",
    );
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("removes the temporary file when core rejects it", async () => {
    let path = "";
    mocks.upload.mockImplementation(async (_actor, file) => {
      path = file.path;
      throw new Error("expired");
    });
    await expect(uploadChatAttachmentRequest("client", request())).rejects.toThrow("expired");
    expect(existsSync(path)).toBe(false);
  });
});
