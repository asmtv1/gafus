/** G15: literal in-process Hono HTTP captures. Real route + dispatcher + JWT middleware,
 * fake authenticated identities, fake Redis and injected Core/Stream/storage results.
 * Captures are NOT proof of real Core ACL, PostgreSQL, Stream, S3, multipart parsing or TCP.
 */
import { Hono } from "hono";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  jwt: vi.fn(), registration: vi.fn(), rate: vi.fn(), state: vi.fn(), dialogs: vi.fn(),
  session: vi.fn(), start: vi.fn(), send: vi.fn(), reaction: vi.fn(), action: vi.fn(),
  upload: vi.fn(), delUpload: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: m.jwt }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: m.registration }));
vi.mock("@gafus/queues", () => ({ connection: { eval: m.rate } }));
vi.mock("@gafus/core/services/cynologistChat", () => ({
  ChatError: class ChatError extends Error {
    constructor(public code: string, message: string, public status = 400) { super(message); }
  },
  getChatState: m.state, listChatDialogs: m.dialogs, getChatSession: m.session,
  startChat: m.start, sendChatMessage: m.send, manageChatReaction: m.reaction,
  manageOwnChatMessage: m.action, acceptChatWebhook: vi.fn(),
}));
vi.mock("@gafus/core/services/cynologistChat/upload", () => ({ deleteChatAttachment: m.delUpload }));
// Intentionally mocked: real upload.ts uses Busboy and writes temporary files.
vi.mock("@gafus/chat-server/upload", () => ({ uploadChatAttachmentRequest: m.upload }));
// Separate module mock for source-relative upload.js imported by real dispatcher.
vi.mock("../../../../../packages/chat-server/src/upload.js", () => ({ uploadChatAttachmentRequest: m.upload }));
import { authMiddleware } from "../../middleware/auth";
import { cynologistChatRoutes } from "./cynologist-chat";
import { ChatError } from "@gafus/core/services/cynologistChat";

const base = "/api/v1/cynologist-chat";
const uuid = "b45152d8-47e8-4ea7-9eb0-42ba4ea81e38";
const requests = new Map<string, { hash: string; ack: unknown }>();
const err = (code: string, status: number, message = code) => new ChatError(code, message, status);
const fakeChat = (actor: string) => ({ id: "chat-A", streamChannelId: "channel-A", clientUserId: "actor-A", trainerUserId: "trainer-T", intake: { name: "synthetic" }, provisionStatus: "READY", lastMessageAt: null, unreadCount: actor === "trainer-T" ? 3 : 0 });
function app() {
  const h = new Hono();
  h.use(base, authMiddleware);
  h.use(`${base}/*`, authMiddleware);
  h.route(base, cynologistChatRoutes);
  return h;
}
function actorAllowed(actor: string, id?: string) {
  if (id && id !== "chat-A") throw err("CHAT_NOT_FOUND", 404, "Диалог не найден");
  if (actor !== "actor-A" && actor !== "trainer-T") throw err("CHAT_FORBIDDEN", 403, "Нет доступа к диалогу");
}
beforeEach(() => {
  vi.clearAllMocks(); requests.clear();
  m.jwt.mockImplementation(async (token: string) => {
    if (token === "invalid") return null;
    const id = token === "actor-B" ? "actor-B" : token === "trainer-T" ? "trainer-T" : "actor-A";
    return { id, username: id, role: id === "trainer-T" ? "TRAINER" : "USER" };
  });
  m.registration.mockResolvedValue(true);
  m.rate.mockResolvedValue(1);
  m.state.mockImplementation(async (actor: string, id?: string) => {
    if (id) actorAllowed(actor, id);
    if (actor === "actor-B") return { enabled: true, isAssignedTrainer: false, canUseCynologistChat: false, canBookConsultations: false, canSend: false, needsIntake: true, chat: null };
    return { enabled: true, isAssignedTrainer: actor === "trainer-T", canUseCynologistChat: actor === "actor-A", canBookConsultations: false, canSend: true, needsIntake: false, chat: fakeChat(actor) };
  });
  m.dialogs.mockImplementation(async (actor: string, cursor?: string) => {
    if (actor !== "trainer-T") throw err("CHAT_FORBIDDEN", 403);
    if (cursor === "invalid") throw err("CHAT_NOT_FOUND", 404);
    return { items: cursor ? [] : [fakeChat(actor)], nextCursor: null };
  });
  m.session.mockImplementation(async (actor: string, id?: string) => {
    actorAllowed(actor, id);
    if (id === "pending") throw err("CHAT_NOT_READY", 409);
    return { apiKey: "SYNTHETIC_API_KEY", userId: `gafus-${actor}`, token: `SYNTHETIC_REDACTED_TOKEN_${actor}`, expiresAt: "2026-10-17T04:00:00.000Z", channelType: "gafus_cynologist", channelId: "channel-A" };
  });
  m.start.mockImplementation(async (actor: string, body: unknown) => {
    if (actor !== "actor-A") throw err("CHAT_SUBSCRIPTION_REQUIRED", 403);
    if (!body || typeof body !== "object" || Array.isArray(body) || !("dogName" in body)) throw err("INVALID_INPUT", 400);
    return m.state(actor);
  });
  m.send.mockImplementation(async (actor: string, body: unknown, id?: string) => {
    actorAllowed(actor, id);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw err("INVALID_INPUT", 400);
    const b = body as { clientMessageId?: unknown; text?: unknown; attachmentIds?: unknown };
    if (typeof b.clientMessageId !== "string" || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(b.clientMessageId) ||
      !(typeof b.text === "string" && b.text.trim().length || Array.isArray(b.attachmentIds) && b.attachmentIds.length)) throw err("INVALID_INPUT", 400);
    const key = `${actor}/${b.clientMessageId}`;
    const fingerprint = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const existing = requests.get(key);
    if (existing && existing.hash !== fingerprint) throw err("CHAT_MESSAGE_CONFLICT", 409);
    if (existing) return existing.ack;
    const ack = { id: `msg-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`, text: b.text ?? "", user: { id: `gafus-${actor}` } };
    requests.set(key, { hash: fingerprint, ack });
    return ack;
  });
  m.upload.mockImplementation(async (actor: string, _req: Request, id?: string) => {
    actorAllowed(actor, id);return { id: "attachment-A", kind: "image", name: "dog.jpg" };
  });
  m.delUpload.mockImplementation(async (actor: string, attachmentId: string, id?: string) => {
    actorAllowed(actor, id); if (attachmentId !== "attachment-A") throw err("CHAT_ATTACHMENT_NOT_FOUND", 404);
  });
  m.reaction.mockImplementation(async (actor: string, body: unknown, id?: string) => {
    actorAllowed(actor, id);
    const b = body as { messageId?: string; type?: string; action?: string } | null;
    if (!b?.messageId || !["like", "love"].includes(b.type ?? "") || !["set", "remove"].includes(b.action ?? "")) throw err("INVALID_INPUT", 400);
    return { messageId: b.messageId };
  });
  m.action.mockImplementation(async (actor: string, body: unknown, id?: string) => {
    actorAllowed(actor, id);
    const b = body as { messageId?: string; action?: string; text?: string } | null;
    if (!b?.messageId || !["edit", "delete"].includes(b.action ?? "")) throw err("INVALID_INPUT", 400);
    if (b.messageId === "foreign-msg") throw err("CHAT_FORBIDDEN", 403);
    if (b.messageId === "expired-msg") throw err("CHAT_MESSAGE_TIME_EXPIRED", 403);
    if (b.action === "edit" && typeof b.text !== "string") throw err("INVALID_INPUT", 400);
    return { messageId: b.messageId };
  });
});

type Opt = { id: string; actor?: "actor-A" | "actor-B" | "trainer-T" | "guest" | "invalid"; method?: string; path?: string; body?: unknown; raw?: string; headers?: Record<string, string>; expectStatus: number; expectedCode?: string };
async function capture(o: Opt) {
  const actor = o.actor ?? "actor-A", method = o.method ?? "GET", path = o.path ?? "";
  const reqPath = `${base}${path}`;
  const requestHeaders: Record<string, string> = { ...(actor === "guest" ? {} : { authorization: `Bearer ${actor}` }), ...o.headers };
  const body = o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body));
  if (body !== undefined && !Object.keys(requestHeaders).some(k => k.toLowerCase() === "content-type")) requestHeaders["content-type"] = "application/json";
  const res = await app().request(`http://local.test${reqPath}`, { method, headers: requestHeaders, ...(body === undefined ? {} : { body }) });
  const responseText = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(responseText); } catch { parsed = null; }
  const props = parsed as { code?: string } | null;
  expect(res.status, o.id).toBe(o.expectStatus);
  if (o.expectedCode) expect(props?.code, o.id).toBe(o.expectedCode);
  expect(res.headers.get("cache-control"), o.id).toBe("no-store");
  if (res.status === 401) {
    expect(props?.code, `${o.id} must have a machine code`).toBe("UNAUTHORIZED");
    expect(responseText).not.toContain("SYNTHETIC_INVALID");
  }
  const root = process.env.G15_CAPTURE_DIR;
  if (!root) throw new Error("G15_CAPTURE_DIR mandatory");
  const canonical = resolve(root);
  const allowed = resolve("/Users/asmtv1/Desktop/gafus-refactor/apps/api/.g15-chat-ag1-isolated-20261017/captures");
  if (canonical !== allowed || !canonical.startsWith(resolve("/Users/asmtv1/Desktop/gafus-refactor") + sep)) throw new Error("capture boundary violation");
  mkdirSync(canonical, { recursive: true });
  const savedRequestHeaders = Object.fromEntries(Object.entries(requestHeaders).filter(([k]) => k.toLowerCase() !== "authorization"));
  const record = { caseId: o.id, origin: "ACTUAL_HONO_HTTP_RESPONSE_REAL_CHAT_DISPATCHER_IN_PROCESS__CORE_AUTH_IDENTITY_AND_REDIS_INJECTED", httpTransport: "in-process-Hono-request-not-TCP", coreBehavior: "TEST_DOUBLE_NOT_REAL_DB_STREAM_OR_ACL", request: { method, path: reqPath, actor, headers: savedRequestHeaders, body: body === undefined ? null : (body.length > 256 ? { redacted: true, byteLength: Buffer.byteLength(body) } : body) }, response: { status: res.status, headers: { "cache-control": res.headers.get("cache-control"), "content-type": res.headers.get("content-type"), "retry-after": res.headers.get("retry-after") }, responseText, json: parsed } };
  writeFileSync(resolve(canonical, `${o.id}.json`), JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
  return { res, parsed };
}

const g15ProofEnabled =
  process.env.G15_CAPTURE_DIR === "/Users/asmtv1/Desktop/gafus-refactor/apps/api/.g15-chat-ag1-isolated-20261017/captures" &&
  process.env.TMPDIR?.startsWith("/Users/asmtv1/Desktop/gafus-refactor/apps/api/.g15-chat-ag1-isolated-20261017/tmp/");
(g15ProofEnabled ? describe : describe.skip)("G15 private Chat method-specific Hono HTTP snapshots (Core injected)", () => {
  it("CHAT-01 state, guest, malformed chatId and principal A/B", async () => {
    await capture({ id: "CHAT-01a-own", path: "?chatId=chat-A", expectStatus: 200 });
    await capture({ id: "CHAT-01a-default", expectStatus: 200 });
    await capture({ id: "CHAT-01a-foreign", actor: "actor-B", path: "?chatId=chat-A", expectStatus: 403, expectedCode: "CHAT_FORBIDDEN" });
    await capture({ id: "CHAT-01a-guest", actor: "guest", expectStatus: 401, expectedCode: "UNAUTHORIZED" });
    await capture({ id: "CHAT-01a-invalid-bearer", actor: "invalid", expectStatus: 401, expectedCode: "UNAUTHORIZED" });
    await capture({ id: "CHAT-01a-invalid-id", path: "?chatId=bad%2Fslash", expectStatus: 400, expectedCode: "INVALID_INPUT" });
    await capture({ id: "CHAT-01a-id-over128", path: `?chatId=${"x".repeat(129)}`, expectStatus: 400, expectedCode: "INVALID_INPUT" });
    await capture({ id: "CHAT-01a-own-B-empty", actor: "actor-B", expectStatus: 200 });
  });
  it("CHAT-01 dialogs, pages, foreign and invalid cursor", async () => {
    await capture({ id: "CHAT-01b-trainer", actor: "trainer-T", path: "/dialogs", expectStatus: 200 });
    await capture({ id: "CHAT-01b-end", actor: "trainer-T", path: "/dialogs?cursor=next", expectStatus: 200 });
    await capture({ id: "CHAT-01b-bad-cursor", actor: "trainer-T", path: "/dialogs?cursor=invalid", expectStatus: 404, expectedCode: "CHAT_NOT_FOUND" });
    await capture({ id: "CHAT-01b-nontrainer", path: "/dialogs", expectStatus: 403, expectedCode: "CHAT_FORBIDDEN" });
  });
  it("CHAT-01 session privacy and no cross-user token", async () => {
    const a = await capture({ id: "CHAT-01c-own", path: "/session?chatId=chat-A", method: "POST", expectStatus: 200 });
    const t = await capture({ id: "CHAT-01c-trainer", actor: "trainer-T", path: "/session?chatId=chat-A", method: "POST", expectStatus: 200 });
    await capture({ id: "CHAT-01c-foreign", actor: "actor-B", path: "/session?chatId=chat-A", method: "POST", expectStatus: 403, expectedCode: "CHAT_FORBIDDEN" });
    expect(JSON.stringify(a.parsed)).not.toEqual(JSON.stringify(t.parsed));
  });
  it("CHAT-04 start ACK / intake errors (injected Core)", async () => {
    await capture({ id: "CHAT-04a-start", method: "POST", path: "/start", body: { dogName: "Dog A" }, expectStatus: 200 });
    await capture({ id: "CHAT-04a-start-repeat", method: "POST", path: "/start", body: { dogName: "Dog A" }, expectStatus: 200 });
    await capture({ id: "CHAT-04a-start-null", method: "POST", path: "/start", body: null, expectStatus: 400, expectedCode: "INVALID_INPUT" });
    await capture({ id: "CHAT-04a-start-foreign", actor: "actor-B", method: "POST", path: "/start", body: { dogName: "Dog A" }, expectStatus: 403, expectedCode: "CHAT_SUBSCRIPTION_REQUIRED" });
  });
  it("CHAT-03 UUID ACK duplicate/conflict and actor isolation (injected Core)", async () => {
    const body = { clientMessageId: uuid, text: "Hello" };
    const one = await capture({ id: "CHAT-03-send", method: "POST", path: "/messages?chatId=chat-A", body, expectStatus: 200 });
    const two = await capture({ id: "CHAT-03-replay", method: "POST", path: "/messages?chatId=chat-A", body, expectStatus: 200 });
    expect(one.parsed).toEqual(two.parsed);
    await capture({ id: "CHAT-03-conflict", method: "POST", path: "/messages?chatId=chat-A", body: { ...body, text: "CHANGED" }, expectStatus: 409, expectedCode: "CHAT_MESSAGE_CONFLICT" });
    await capture({ id: "CHAT-03-empty", method: "POST", path: "/messages?chatId=chat-A", body: { clientMessageId: uuid }, expectStatus: 400, expectedCode: "INVALID_INPUT" });
    await capture({ id: "CHAT-03-bad-uuid", method: "POST", path: "/messages?chatId=chat-A", body: { clientMessageId: "idem-1", text: "Hello" }, expectStatus: 400, expectedCode: "INVALID_INPUT" });
    await capture({ id: "CHAT-03-foreign", method: "POST", actor: "actor-B", path: "/messages?chatId=chat-A", body, expectStatus: 403, expectedCode: "CHAT_FORBIDDEN" });
    await capture({ id: "CHAT-03-guest", method: "POST", actor: "guest", path: "/messages?chatId=chat-A", body, expectStatus: 401, expectedCode: "UNAUTHORIZED" });
    await capture({ id: "CHAT-03-bad-auth-scheme", method: "POST", actor: "guest", headers: { Authorization: "Basic SYNTHETIC_INVALID" }, path: "/messages?chatId=chat-A", body, expectStatus: 401, expectedCode: "UNAUTHORIZED" });
    await capture({ id: "CHAT-03-attachment-only", method: "POST", path: "/messages?chatId=chat-A", body: { clientMessageId: "b45152d8-47e8-4ea7-9eb0-42ba4ea81e39", attachmentIds: ["attachment-A"] }, expectStatus: 200 });
    expect(requests.size).toBe(2);
  });
  it("CHAT-05 multipart-route upload ACK and delete ACK are separate (uploader injected)", async () => {
    await capture({ id: "CHAT-05a-upload-mock", method: "POST", path: "/attachments?chatId=chat-A", raw: "synthetic-body-not-multipart", headers: { "content-type": "multipart/form-data; boundary=fixture" }, expectStatus: 200 });
    await capture({ id: "CHAT-05b-delete", method: "DELETE", path: "/attachments?chatId=chat-A&attachmentId=attachment-A", expectStatus: 200 });
    await capture({ id: "CHAT-05b-missing", method: "DELETE", path: "/attachments?chatId=chat-A&attachmentId=absent", expectStatus: 404, expectedCode: "CHAT_ATTACHMENT_NOT_FOUND" });
    await capture({ id: "CHAT-05b-foreign", method: "DELETE", actor: "actor-B", path: "/attachments?chatId=chat-A&attachmentId=attachment-A", expectStatus: 403, expectedCode: "CHAT_FORBIDDEN" });
  });
  it("CHAT-04 reactions set/remove and own message actions (Core injected)", async () => {
    for (const action of ["set", "remove"]) await capture({ id: `CHAT-04b-reaction-${action}`, method: "POST", path: "/reactions?chatId=chat-A", body: { messageId: "msg-A", type: "like", action }, expectStatus: 200 });
    await capture({ id: "CHAT-04b-reaction-wrong-type", method: "POST", path: "/reactions?chatId=chat-A", body: { messageId: "msg-A", type: "invalid", action: "set" }, expectStatus: 400, expectedCode: "INVALID_INPUT" });
    await capture({ id: "CHAT-04b-reaction-foreign", method: "POST", actor: "actor-B", path: "/reactions?chatId=chat-A", body: { messageId: "msg-A", type: "like", action: "set" }, expectStatus: 403, expectedCode: "CHAT_FORBIDDEN" });
    await capture({ id: "CHAT-04c-edit", method: "POST", path: "/message-actions?chatId=chat-A", body: { action: "edit", messageId: "msg-A", text: "edited" }, expectStatus: 200 });
    await capture({ id: "CHAT-04c-delete", method: "POST", path: "/message-actions?chatId=chat-A", body: { action: "delete", messageId: "msg-A" }, expectStatus: 200 });
    await capture({ id: "CHAT-04c-expired-mock", method: "POST", path: "/message-actions?chatId=chat-A", body: { action: "edit", messageId: "expired-msg", text: "too late" }, expectStatus: 403, expectedCode: "CHAT_MESSAGE_TIME_EXPIRED" });
    await capture({ id: "CHAT-04c-foreign-msg", method: "POST", path: "/message-actions?chatId=chat-A", body: { action: "delete", messageId: "foreign-msg" }, expectStatus: 403, expectedCode: "CHAT_FORBIDDEN" });
  });
  it("negative verbs use actual 404, not fabricated 405", async () => {
    for (const [id, method, path] of [
      ["NEG-GET-reactions", "GET", "/reactions"], ["NEG-GET-actions", "GET", "/message-actions"],
      ["NEG-POST-dialogs", "POST", "/dialogs"], ["NEG-PUT-attachments", "PUT", "/attachments"],
      ["NEG-DELETE-messages", "DELETE", "/messages"], ["NEG-GET-unknown", "GET", "/something"],
    ]) await capture({ id, method, path, expectStatus: 404, expectedCode: "NOT_FOUND" });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("actual dispatcher validation, rate-limit 429 absent Retry-After, sanitized 503", async () => {
    await capture({ id: "NEG-JSON-invalid", method: "POST", path: "/messages", raw: "{invalid", expectStatus: 400, expectedCode: "INVALID_INPUT" });
    await capture({ id: "NEG-JSON-over32768", method: "POST", path: "/messages", raw: JSON.stringify({ text: "x".repeat(32770) }), expectStatus: 400, expectedCode: "INVALID_INPUT" });
    await capture({ id: "NEG-JSON-null", method: "POST", path: "/messages", raw: "null", expectStatus: 400, expectedCode: "INVALID_INPUT" });
    m.rate.mockResolvedValueOnce(61);
    const send429 = await capture({ id: "CHAT-06-rate-send-61", method: "POST", path: "/messages", body: { clientMessageId: uuid, text: "hi" }, expectStatus: 429, expectedCode: "CHAT_RATE_LIMIT" });
    expect(send429.res.headers.get("retry-after")).toBeNull();
    m.rate.mockResolvedValueOnce(11);
    await capture({ id: "CHAT-06-rate-upload-11", method: "POST", path: "/attachments", raw: "blob", expectStatus: 429, expectedCode: "CHAT_RATE_LIMIT" });
    m.rate.mockResolvedValueOnce(31);
    await capture({ id: "CHAT-06-rate-other-31", method: "POST", path: "/session", expectStatus: 429, expectedCode: "CHAT_RATE_LIMIT" });
    m.send.mockRejectedValueOnce(new Error("SYNTHETIC_PRIVATE_PROVIDER_SECRET"));
    const failed = await capture({ id: "CHAT-06-provider-503", method: "POST", path: "/messages?chatId=chat-A", body: { clientMessageId: uuid, text: "hi" }, expectStatus: 503, expectedCode: "CHAT_UNAVAILABLE" });
    expect(JSON.stringify(failed.parsed)).not.toContain("SYNTHETIC_PRIVATE_PROVIDER_SECRET");
  });
});
