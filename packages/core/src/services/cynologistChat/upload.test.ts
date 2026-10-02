import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  canSend: vi.fn(),
  create: vi.fn(),
  image: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: { chatAttachment: { create: mock.create } } }));
vi.mock("./service", () => ({ requireCanSend: mock.canSend, chatForActor: vi.fn() }));
vi.mock("./stream", () => ({
  COMMUNITY_CHANNEL_TYPE: "gafus_community",
  COMMUNITY_CHANNEL_ID: "general",
  CHAT_CHANNEL_TYPE: "test",
  ChatError: class extends Error {
    constructor(
      public code: string,
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  streamServer: () => ({ channel: () => ({ sendImage: mock.image, deleteImage: mock.remove }) }),
}));
import { uploadChatAttachment } from "./upload";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
beforeEach(() => {
  vi.clearAllMocks();
  mock.remove.mockResolvedValue(undefined);
  mock.canSend.mockResolvedValue({ id: "chat", streamChannelId: "channel" });
  mock.create.mockImplementation(async (v) => v.data);
  mock.image.mockImplementation(async (stream: AsyncIterable<Buffer>) => {
    for await (const _chunk of stream) {
      /* consume the streaming upload */
    }
    return { file: "https://cdn.example/image" };
  });
});
function request(data: Buffer, mime = "image/png", field = "file", extra = false) {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(data)], { type: mime }), "file.png");
  if (extra) form.append("unexpected", "extra");
  return new Request("http://localhost/upload", { method: "POST", body: form });
}
describe("streaming chat uploads", () => {
  it("accepts a single valid multipart image", async () => {
    const file = await uploadChatAttachment("client", request(png));
    expect(file).toMatchObject({ kind: "image", mime: "image/png", size: png.length });
    expect(mock.canSend).toHaveBeenCalledTimes(2);
  });
  it("rejects MIME substitution before CDN upload", async () => {
    await expect(uploadChatAttachment("client", request(png, "video/mp4"))).rejects.toMatchObject({
      code: "CHAT_MIME_MISMATCH",
    });
    expect(mock.image).not.toHaveBeenCalled();
  });
  it("rejects arbitrary documents with an image MIME", async () => {
    await expect(
      uploadChatAttachment("client", request(Buffer.from("%PDF-1.4\n"))),
    ).rejects.toMatchObject({ code: "CHAT_MIME_MISMATCH" });
  });
  it("rejects an extra form field and a wrong file field", async () => {
    await expect(
      uploadChatAttachment("client", request(png, "image/png", "file", true)),
    ).rejects.toMatchObject({ code: "CHAT_INVALID_FILE" });
    await expect(
      uploadChatAttachment("client", request(png, "image/png", "arbitrary")),
    ).rejects.toMatchObject({ code: "CHAT_INVALID_FILE" });
  });
  it("cleans the uploaded CDN object if the database write fails", async () => {
    mock.create.mockRejectedValue(new Error("database unavailable"));
    await expect(uploadChatAttachment("client", request(png))).rejects.toThrow(
      "database unavailable",
    );
    expect(mock.remove).toHaveBeenCalledWith("https://cdn.example/image");
  });
  it("rechecks access after receiving a file", async () => {
    mock.canSend
      .mockResolvedValueOnce({ id: "chat", streamChannelId: "channel" })
      .mockRejectedValueOnce(new Error("expired"));
    await expect(uploadChatAttachment("client", request(png))).rejects.toThrow("expired");
    expect(mock.image).not.toHaveBeenCalled();
  });
});
