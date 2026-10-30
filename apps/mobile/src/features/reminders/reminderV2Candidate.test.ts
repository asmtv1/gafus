import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportClientError } from "@/shared/lib/tracer";
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
import {
  createReminderV2ReviewCandidate,
  type ImmutableReminderV2Post,
  type ReminderV2ReviewTransport,
} from "./reminderV2Candidate";
const KEY = "4bc11bb9-a9a7-499a-8aa2-86fbeabfa47d";
const owner = () => ({ ownerId: "A", authEpoch: "E1" });
const draft = () => ({
  name: " Дрессировка ",
  reminderTime: "09:05",
  reminderDays: "1,3",
  timezone: "Europe/Moscow",
});
const normalized = () => ({
  name: "Дрессировка",
  reminderTime: "09:05",
  reminderDays: "1,3",
  timezone: "Europe/Moscow",
});
const reminder = (id = "r1") => ({
  id,
  name: "Дрессировка",
  reminderTime: "09:05",
  reminderDays: "1,3",
  timezone: "Europe/Moscow",
  enabled: true,
});
const waiting = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
type PostFn = ReminderV2ReviewTransport["post"];
type GetFn = NonNullable<ReminderV2ReviewTransport["ownerLookupMock"]>;
let post = vi.fn<PostFn>(),
  get = vi.fn<GetFn>();
let candidate: ReturnType<typeof createReminderV2ReviewCandidate>;
beforeEach(() => {
  post = vi.fn<PostFn>().mockResolvedValue({ success: true, data: reminder() });
  get = vi
    .fn<GetFn>()
    .mockResolvedValue({ success: true, data: { status: "COMMITTED", reminder: reminder() } });
  candidate = createReminderV2ReviewCandidate({ uuidV4: () => KEY, post, ownerLookupMock: get });
});
describe("AG3 Reminder V2 AG4-approved source-only header UUIDv4 contract", () => {
  it("single POST; stable Header UUID, EXACT existing 4-key JSON, no G05 JSON clientRequestId", async () => {
    const payload = draft();
    const result = await candidate.create(owner(), payload, () => true);
    expect(result.kind).toBe("acknowledged");
    expect(post).toHaveBeenCalledOnce();
    const req = post.mock.calls[0][0] as ImmutableReminderV2Post;
    expect(req).toEqual({
      method: "POST",
      path: "/api/v1/reminders",
      headers: { "Idempotency-Key": KEY },
      body: normalized(),
      requestGuard: expect.any(Function),
    });
    expect(Object.keys(req.body).sort()).toEqual(
      ["name", "reminderTime", "reminderDays", "timezone"].sort(),
    );
    expect(JSON.stringify(req.body)).not.toMatch(
      /clientRequestId|idempotencyKey|authEpoch|ownerId/,
    );
    payload.name = "CHANGED";
    expect(req.body.name).toBe("Дрессировка");
    expect(Object.isFrozen(req.body)).toBe(true);
    expect(await candidate.create(owner(), draft(), () => true)).toEqual({ kind: "blocked" });
  });
  it("200 ACK is not final success until exact id and all canonical fields are in owner's list", async () => {
    await candidate.create(owner(), draft(), () => true);
    expect(candidate.confirmList(owner(), [reminder("r2")], () => true)).toEqual({
      kind: "unknown",
    });
    expect(get).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledOnce();
  });
  it("exact readback confirms, still never auto POST again", async () => {
    await candidate.create(owner(), draft(), () => true);
    expect(candidate.confirmList(owner(), [reminder()], () => true)).toEqual({
      kind: "confirmed",
      reminder: reminder(),
    });
    expect(candidate.state()).toBe("confirmed");
    expect(post).toHaveBeenCalledOnce();
  });
  it("400 REMINDER_LIMIT_REACHED is REJECTED, not ambiguous UNKNOWN, no auto retry", async () => {
    post.mockResolvedValueOnce({
      success: false,
      code: "REMINDER_LIMIT_REACHED",
      error: "Максимум 5 напоминаний",
    });
    expect(await candidate.create(owner(), draft(), () => true)).toEqual({
      kind: "rejected",
      code: "REMINDER_LIMIT_REACHED",
    });
    expect(candidate.state()).toBe("rejected");
    expect(get).not.toHaveBeenCalled();
    expect(await candidate.create(owner(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).toHaveBeenCalledOnce();
  });
  it.each(["REMINDER_IDEMPOTENCY_CONFLICT", "REMINDER_IDEMPOTENCY_INVALID"] as const)(
    "409/400 %s terminal, no retry",
    async (code) => {
      post.mockResolvedValueOnce({ success: false, code });
      expect(await candidate.create(owner(), draft(), () => true)).toEqual({
        kind: "terminal",
        code,
      });
      expect(candidate.state()).toBe("terminal");
      expect(await candidate.create(owner(), draft(), () => true)).toEqual({ kind: "blocked" });
    },
  );
  it.each(["REMINDER_OPERATION_UNKNOWN", "REQUEST_TIMEOUT", "SERVER_ERROR", "NETWORK_ERROR"])(
    "%s remains UNKNOWN, never automatically lookup/recreate",
    async (code) => {
      post.mockResolvedValueOnce({ success: false, code });
      expect(await candidate.create(owner(), draft(), () => true)).toEqual({ kind: "unknown" });
      expect(post).toHaveBeenCalledOnce();
      expect(get).not.toHaveBeenCalled();
      expect(await candidate.create(owner(), draft(), () => true)).toEqual({ kind: "blocked" });
    },
  );
  it("lost ACK after possible COMMIT locks the same key, no second POST", async () => {
    post.mockRejectedValueOnce(new Error("PRIVATE_NAME_OR_TOKEN"));
    expect(await candidate.create(owner(), draft(), () => true)).toEqual({ kind: "unknown" });
    expect(candidate.state()).toBe("unknown");
    expect(post).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(reportClientError).mock.calls)).not.toMatch(
      /PRIVATE_NAME_OR_TOKEN|Дрессировка|4bc11bb9|ownerId|authEpoch/,
    );
  });
  it("manual owner lookup reuses exact URI-encoded UUID and requires COMMITTED same payload", async () => {
    post.mockRejectedValueOnce(new Error("LOST_ACK"));
    await candidate.create(owner(), draft(), () => true);
    expect(await candidate.manualLookup(owner(), () => true)).toEqual({
      kind: "confirmed",
      reminder: reminder(),
    });
    expect(get).toHaveBeenCalledExactlyOnceWith({
      method: "GET",
      path: `/api/v1/reminders/operations/${KEY}`,
      requestGuard: expect.any(Function),
    });
    expect(get.mock.calls[0][0].requestGuard()).toBe(true);
    expect(post).toHaveBeenCalledOnce();
  });
  it("404 expired/deleted/foreign receipt is UNKNOWN, never negative evidence", async () => {
    post.mockRejectedValueOnce(new Error("LOST_ACK"));
    await candidate.create(owner(), draft(), () => true);
    get.mockResolvedValueOnce({ success: false, code: "REMINDER_OPERATION_UNKNOWN" });
    expect(await candidate.manualLookup(owner(), () => true)).toEqual({ kind: "unknown" });
    expect(candidate.state()).toBe("unknown");
    expect(post).toHaveBeenCalledOnce();
  });
  it("wrong receipt ID/body or missing lookup mock cannot confirm", async () => {
    post.mockRejectedValueOnce(new Error("LOST_ACK"));
    await candidate.create(owner(), draft(), () => true);
    get.mockResolvedValueOnce({
      success: true,
      data: { status: "COMMITTED", reminder: { ...reminder(), name: "Other" } },
    });
    expect(await candidate.manualLookup(owner(), () => true)).toEqual({ kind: "unknown" });
    const withoutLookup = createReminderV2ReviewCandidate({ uuidV4: () => KEY, post });
    post.mockRejectedValueOnce(new Error("LOST_ACK"));
    await withoutLookup.create(owner(), draft(), () => true);
    expect(await withoutLookup.manualLookup(owner(), () => true)).toEqual({ kind: "gated" });
  });
  it("rapid two calls while POST pending => exactly one, immutable intent captured before SDK", async () => {
    const d = waiting<{ success: boolean; data: ReturnType<typeof reminder> }>();
    post.mockReturnValueOnce(d.promise);
    const first = candidate.create(owner(), draft(), () => true);
    expect(await candidate.create(owner(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).toHaveBeenCalledOnce();
    d.resolve({ success: true, data: reminder() });
    expect((await first).kind).toBe("acknowledged");
  });
  it("owner A→B→A fresh epoch fences late ACK and lookup, no foreign data", async () => {
    const d = waiting<{ success: boolean; data: ReturnType<typeof reminder> }>();
    post.mockReturnValueOnce(d.promise);
    let epoch = "E1";
    const live = () => epoch === "E1";
    const first = candidate.create(owner(), draft(), live);
    epoch = "B1";
    epoch = "E2";
    expect(post.mock.calls[0][0].requestGuard()).toBe(false);
    d.resolve({ success: true, data: reminder() });
    expect(await first).toEqual({ kind: "stale" });
    expect(await candidate.manualLookup(owner(), live)).toEqual({ kind: "stale" });
    expect(get).not.toHaveBeenCalled();
  });
  it("AG1 normalized weekdays are frozen before mock POST, never replay with changed input", async () => {
    await candidate.create(owner(), { ...draft(), reminderDays: "3,1,3" }, () => true);
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0][0].body.reminderDays).toBe("1,3");
  });
  it("UUID provider failure never dispatches a POST", async () => {
    const faulty = createReminderV2ReviewCandidate({
      uuidV4: () => {
        throw new Error("PRIVATE_ENTROPY");
      },
      post,
    });
    expect(await faulty.create(owner(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(reportClientError).mock.calls)).not.toContain(
      "PRIVATE_ENTROPY",
    );
  });
  it("invalid key and malformed draft never dispatch mocked POST", async () => {
    const bad = createReminderV2ReviewCandidate({ uuidV4: () => "not-a-uuid-v4", post });
    expect(await bad.create(owner(), draft(), () => true)).toEqual({ kind: "blocked" });
    expect(
      await candidate.create(owner(), { ...draft(), reminderTime: "24:45" }, () => true),
    ).toEqual({ kind: "blocked" });
    expect(post).not.toHaveBeenCalled();
  });
});
