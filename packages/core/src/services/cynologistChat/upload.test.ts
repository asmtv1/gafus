import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  canSend: vi.fn(),
  create: vi.fn(),
  image: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: {
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
    $queryRaw: async () => [{ id: "exists" }], chatAttachment: { create: mock.create },
  }),
} }));
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
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "chat-upload-test-"));
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
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
async function temporaryFile(data: Buffer, mime = "image/png") {
  const path = join(dir, "file.png");
  await writeFile(path, data);
  return { path, name: "file.png", declaredMime: mime };
}
describe("chat attachment domain validation", () => {
  it("accepts a valid inspected image", async () => {
    const file = await uploadChatAttachment("client", await temporaryFile(png));
    expect(file).toMatchObject({ kind: "image", mime: "image/png", size: png.length });
    expect(mock.canSend).toHaveBeenCalledTimes(2);
  });
  it("rejects MIME substitution before CDN upload", async () => {
    await expect(
      uploadChatAttachment("client", await temporaryFile(png, "video/mp4")),
    ).rejects.toMatchObject({
      code: "CHAT_MIME_MISMATCH",
    });
    expect(mock.image).not.toHaveBeenCalled();
  });
  it("rejects arbitrary documents with an image MIME", async () => {
    await expect(
      uploadChatAttachment("client", await temporaryFile(Buffer.from("%PDF-1.4\n"))),
    ).rejects.toMatchObject({ code: "CHAT_MIME_MISMATCH" });
  });
  it("cleans the uploaded CDN object if the database write fails", async () => {
    mock.create.mockRejectedValue(new Error("database unavailable"));
    await expect(uploadChatAttachment("client", await temporaryFile(png))).rejects.toThrow(
      "database unavailable",
    );
    expect(mock.remove).toHaveBeenCalledWith("https://cdn.example/image");
  });
  it("rechecks access after receiving a file", async () => {
    mock.canSend
      .mockResolvedValueOnce({ id: "chat", streamChannelId: "channel" })
      .mockRejectedValueOnce(new Error("expired"));
    await expect(uploadChatAttachment("client", await temporaryFile(png))).rejects.toThrow(
      "expired",
    );
    expect(mock.image).not.toHaveBeenCalled();
  });
});
