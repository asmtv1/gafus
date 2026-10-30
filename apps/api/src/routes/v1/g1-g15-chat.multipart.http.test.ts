/** Real Busboy multipart HTTP parsing, mocked Core ACL + storage; scratch TMPDIR only. */
import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ jwt: vi.fn(), registration: vi.fn(), rate: vi.fn(), canSend: vi.fn(), save: vi.fn() }));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: m.jwt }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: m.registration }));
vi.mock("@gafus/queues", () => ({ connection: { eval: m.rate } }));
vi.mock("@gafus/core/services/cynologistChat", () => ({
  ChatError: class ChatError extends Error {
    constructor(public code: string, message: string, public status = 400) { super(message); }
  },
  requireCanSend: m.canSend,
  requireCommunityCanSend: vi.fn(),
}));
vi.mock("@gafus/core/services/cynologistChat/upload", () => ({
  uploadChatAttachment: m.save,
  deleteChatAttachment: vi.fn(),
}));
import { authMiddleware } from "../../middleware/auth";
import { cynologistChatRoutes } from "./cynologist-chat";
const base = "/api/v1/cynologist-chat/attachments?chatId=chat-A";
function app() {
  const a = new Hono();
  a.use("/api/v1/cynologist-chat", authMiddleware);
  a.use("/api/v1/cynologist-chat/*", authMiddleware);
  a.route("/api/v1/cynologist-chat", cynologistChatRoutes);
  return a;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.jwt.mockResolvedValue({ id: "actor-A", username: "alice", role: "USER" });
  m.registration.mockResolvedValue(true);
  m.rate.mockResolvedValue(1);
  m.canSend.mockResolvedValue({ id: "chat-A" });
  m.save.mockImplementation(async (_id: string, data: { path: string; name: string; declaredMime: string }, chatId?: string) => {
    const bytes = await readFile(data.path);
    expect(bytes.toString("utf8")).toBe("G15_TEST_FILE_BYTES");
    expect(chatId).toBe("chat-A");
    return { id: "synthetic-attachment-id", kind: "image", name: data.name };
  });
});
async function capture(id: string, request: Request, status: number, errorCode?: string) {
  const raw = Buffer.from(await request.clone().arrayBuffer());
  const response = await app().request(request);
  const responseText = await response.text();
  const json = JSON.parse(responseText);
  expect(response.status, id).toBe(status);
  if (errorCode) expect(json.code, id).toBe(errorCode);
  expect(response.headers.get("cache-control"), id).toBe("no-store");
  const directory = process.env.G15_CAPTURE_DIR;
  if (directory !== "/Users/asmtv1/Desktop/gafus-refactor/apps/api/.g15-chat-ag1-isolated-20261017/captures") throw new Error("G15 scratch capture dir missing or changed");
  mkdirSync(directory, { recursive: true });
  const record = {
    caseId: id,
    origin: "REAL_HONO_DISPATCHER_AND_REAL_BUSBOY_MULTIPART_PARSER__FAKE_AUTH_CORE_PERMISSION_STORAGE_REDIS",
    httpTransport: "in-process-Hono-request-not-TCP",
    request: {
      method: request.method, path: new URL(request.url).pathname + new URL(request.url).search,
      actor: "actor-A (mock JWT)",
      headers: { "content-type": request.headers.get("content-type") },
      bodyBase64: raw.toString("base64"), byteLength: raw.length,
    },
    response: { status: response.status,
      headers: { "cache-control": response.headers.get("cache-control"), "content-type": response.headers.get("content-type"), "retry-after": response.headers.get("retry-after") },
      responseText, json },
  };
  writeFileSync(resolve(directory, `${id}.json`), JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
  return json;
}
const req = (form: FormData) => new Request(`http://local.test${base}`, { method: "POST", headers: { authorization: "Bearer actor-A" }, body: form });
const g15ProofEnabled =
  process.env.G15_CAPTURE_DIR === "/Users/asmtv1/Desktop/gafus-refactor/apps/api/.g15-chat-ag1-isolated-20261017/captures" &&
  process.env.TMPDIR?.startsWith("/Users/asmtv1/Desktop/gafus-refactor/apps/api/.g15-chat-ag1-isolated-20261017/tmp/");
(g15ProofEnabled ? describe : describe.skip)("G15 real multipart Busboy parser via Hono; Core/storage injected", () => {
  it("one JPEG under correct multipart field returns independent upload ACK", async () => {
    const f = new FormData(); f.append("file", new Blob(["G15_TEST_FILE_BYTES"], { type: "image/jpeg" }), "dog.jpg");
    const json = await capture("CHAT-05a-busboy-jpeg", req(f), 200);
    expect(json.data).toEqual({ id: "synthetic-attachment-id", kind: "image", name: "dog.jpg" });
    expect(m.save).toHaveBeenCalledTimes(1);
  });
  it("wrong field is rejected before calling Core upload", async () => {
    const f = new FormData(); f.append("photo", new Blob(["wrong"], { type: "image/jpeg" }), "dog.jpg");
    await capture("CHAT-05a-busboy-wrong-field", req(f), 400, "CHAT_INVALID_FILE");
    expect(m.save).not.toHaveBeenCalled();
  });
  it("two multipart files fail the parser's one-file contract", async () => {
    const f = new FormData();
    f.append("file", new Blob(["one"], { type: "image/jpeg" }), "1.jpg");
    f.append("file", new Blob(["two"], { type: "image/jpeg" }), "2.jpg");
    await capture("CHAT-05a-busboy-two-files", req(f), 400, "CHAT_INVALID_FILE");
    expect(m.save).not.toHaveBeenCalled();
  });
  it("empty multipart cannot produce a fake success ACK", async () => {
    await capture("CHAT-05a-busboy-no-file", req(new FormData()), 400, "CHAT_INVALID_FILE");
    expect(m.save).not.toHaveBeenCalled();
  });
  it("non-multipart Content-Type is rejected, status observed not guessed", async () => {
    const req = new Request(`http://local.test${base}`, { method: "POST", headers: { authorization: "Bearer actor-A", "content-type": "application/json" }, body: "{}" });
    await capture("CHAT-05a-busboy-wrong-content-type", req, 400, "CHAT_INVALID_FILE");
    expect(m.save).not.toHaveBeenCalled();
  });
});
