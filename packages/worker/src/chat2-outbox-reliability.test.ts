import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
  changes: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
  updatedCount: 1,
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    chat2OutboxEvent: {
      findMany: vi.fn(async () => state.items),
      updateMany: vi.fn(async (query: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        state.changes.push(query);
        return { count: state.updatedCount };
      }),
    },
  },
}));
// SQL fencing and broker behavior are under test; telemetry is covered separately.
vi.mock("@gafus/logger", () => ({createWorkerLogger: () => ({warn:vi.fn(),error:vi.fn(),info:vi.fn()})}));
vi.mock("@gafus/logger/server-telemetry", () => ({
  configureServerTelemetry:vi.fn(),startCorrelatedSpan:() => ({end:vi.fn()}),
  withServerSpan:async (_span: unknown, action:()=>Promise<unknown>)=>action(),
  markServerSpanError:vi.fn(),
}));
vi.mock("@gafus/queues", () => ({ pushQueue: { add: vi.fn() } }));
vi.mock("@gafus/cdn-upload", () => ({
  chat2DeletePrivateMedia: vi.fn(), chat2V2DeleteObjects: vi.fn(),
}));
vi.mock("./chat2-readiness", () => ({
  chat2BrokerPublishUrl: () => "http://broker.test/api/publish",
  recordChat2PollSuccess: vi.fn(), resetChat2PollReadiness: vi.fn(),
  probeChat2BrokerAuth: vi.fn(),
}));
import { processChat2OutboxOnce } from "./chat2-outbox-worker";

const event = (attempts: number) => ({
  id: "evt_test_chat_123", conversationId: "private-conversation",
  eventType: "member.joined", messageId: null, attempts, lastErrorCode: null,
  claimedUntil: null, deadLetteredAt: null, deliveredAt: null,
});
describe("Chat2 outbox crash/fencing/DLQ", () => {
  beforeEach(() => {
    state.items = []; state.changes = []; state.updatedCount = 1;
    vi.stubEnv("CHAT2_CENTRIFUGO_HTTP_API", "http://broker.test");
    vi.stubEnv("CHAT2_CENTRIFUGO_API_KEY", "private");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it("uses a fencing token on every successful completion", async () => {
    state.items = [event(0)];
    const send = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", send);
    const result = await processChat2OutboxOnce();
    expect(result).toMatchObject({ delivered: 1, failed: 0, deadLettered: 0 });
    const token = state.changes[0]!.data.claimToken;
    expect(token).toMatch(/^[a-f0-9-]{36}$/);
    expect(state.changes[1]!.where.claimToken).toBe(token);
    const call = send.mock.calls as unknown as Array<[string, { body: string }]>;
    const body = JSON.parse(call[0]![1].body);
    expect(body.data.eventId).toBe("evt_test_chat_123");
    expect(body.data).not.toHaveProperty("privatePayload");
  });
  it("DLQs an exhausted attempt instead of continuously resending", async () => {
    state.items = [event(7)];
    vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Secret upstream error"); }));
    const result = await processChat2OutboxOnce();
    expect(result).toMatchObject({ failed: 1, deadLettered: 1 });
    expect(state.changes[1]!.data.lastErrorCode).toBe("CHAT2_OUTBOX_DISPATCH_FAILED");
    expect(state.changes[1]!.data.deadLetteredAt).toBeInstanceOf(Date);
    expect((state.changes[1]!.data.nextAttemptAt as Date).toISOString()).toBe("9999-12-31T00:00:00.000Z");
    expect(JSON.stringify(state.changes)).not.toContain("Secret upstream error");
  });
  it("does not overwrite a newer worker's completion after claim takeover", async () => {
    state.items = [event(0)];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    // First claim succeeds, second CAS is rejected by the DB (new owner).
    const db = (await import("@gafus/prisma")).prisma.chat2OutboxEvent;
    vi.mocked(db.updateMany).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const result = await processChat2OutboxOnce();
    expect(result.delivered).toBe(0);
    expect(vi.mocked(db.updateMany).mock.calls[1]![0].where).toHaveProperty("claimToken");
  });
  it("classifies 403 as permanent and respects 429 Retry-After", async () => {
    state.items = [event(0)];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, headers: new Headers() })));
    await processChat2OutboxOnce();
    expect(state.changes[1]!.data.lastErrorCode).toBe("CHAT2_BROKER_AUTH_DENIED");
    expect(state.changes[1]!.data.deadLetteredAt).toBeInstanceOf(Date);
    expect((state.changes[1]!.data.nextAttemptAt as Date).toISOString()).toBe("9999-12-31T00:00:00.000Z");
    state.changes = []; state.items = [event(0)];
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 429, headers: new Headers({ "retry-after": "40" }),
    })));
    const started = Date.now();
    await processChat2OutboxOnce();
    expect(state.changes[1]!.data.lastErrorCode).toBe("CHAT2_CENTRIFUGO_RATE_LIMITED");
    const target = state.changes[1]!.data.nextAttemptAt as Date;
    expect(target.getTime() - started).toBeGreaterThanOrEqual(40_000);
    expect(state.changes[1]!.data).not.toHaveProperty("deadLetteredAt");
  });
  it("quarantines previously exhausted leases without external dispatch", async () => {
    state.items = [event(11)];
    const send = vi.fn(); vi.stubGlobal("fetch", send);
    const result = await processChat2OutboxOnce();
    expect(result.deadLettered).toBe(1);
    expect(state.changes[0]!.data.nextAttemptAt).toEqual(new Date("9999-12-31T00:00:00.000Z"));
    expect(send).not.toHaveBeenCalled();
  });
});
