import { beforeEach, describe, expect, it, vi } from "vitest";

const UUID_A = "b713906f-c774-41d9-84ae-1585fb13f232";
const UUID_B = "838befa4-f95c-485d-a4a5-6cde79915d73";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authenticated: true,
  loading: false,
  offer: vi.fn(),
  init: vi.fn(),
  wire: vi.fn(),
  purchase: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      user: m.authenticated ? { id: m.owner } : null,
      isAuthenticated: m.authenticated,
      isLoading: m.loading,
    }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () =>
      m.authenticated ? { principalId: m.owner, authEpoch: m.epoch } : null,
  },
}));
vi.mock("@/shared/lib/api/client-context", () => ({
  getMobileClientHeaders: () => ({ "X-Client-Platform": "IOS", "X-Client-Version": "2.0" }),
}));
vi.mock("@/shared/lib/api/client", () => ({
  apiClient: (...args: unknown[]) => {
    m.wire(...args);
    const [endpoint, config] = args as [string, { requestGuard?: () => boolean } | undefined];
    if (config?.requestGuard && !config.requestGuard())
      return Promise.resolve({ success: false, code: "G05_SESSION_CHANGED" });
    if (endpoint === "/api/v1/app-subscription/offer") return m.offer();
    if (endpoint === "/api/v1/app-subscription/apple/token/initialize") return m.init();
    throw new Error("UNEXPECTED_ENDPOINT");
  },
}));
import { appSubscriptionApi } from "../api/appSubscriptionApi";
import {
  createApplePhaseAHttpReviewAdapter,
  getVerifiedApplePhaseAActor,
} from "./applePhaseAHttpReviewAdapter";
const offer = (token: string | null) => ({
  success: true as const,
  data: { appleAppAccountToken: token },
});
const initialized = (token: string) => ({
  success: true as const,
  data: { appleAppAccountToken: token },
});
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function review() {
  return createApplePhaseAHttpReviewAdapter((value) => m.purchase(value));
}
function posts() {
  return m.wire.mock.calls.filter(
    (call: unknown[]) => call[0] === "/api/v1/app-subscription/apple/token/initialize",
  );
}
function reads() {
  return m.wire.mock.calls.filter(
    (call: unknown[]) => call[0] === "/api/v1/app-subscription/offer",
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "A";
  m.epoch = "E1";
  m.authenticated = true;
  m.loading = false;
  m.offer.mockResolvedValue(offer(UUID_A));
  m.init.mockResolvedValue(initialized(UUID_A));
  m.purchase.mockResolvedValue({ ok: true });
});
describe("AG4 approved Apple Phase A HTTP source/mock only, NO live paywall/StoreKit", () => {
  it("old installed token: a guarded GET, no POST, forwards exactly persisted UUID", async () => {
    const result = await review().begin("apple-monthly");
    expect(result).toMatchObject({ ok: true, source: "existing_token" });
    expect(reads()).toHaveLength(1);
    expect(posts()).toHaveLength(0);
    expect(m.purchase).toHaveBeenCalledWith(expect.objectContaining({ appAccountToken: UUID_A }));
  });
  it("null -> one authenticated empty-body POST -> exact GET readback before synthetic purchase", async () => {
    m.offer.mockResolvedValueOnce(offer(null)).mockResolvedValueOnce(offer(UUID_A));
    const result = await review().begin("apple-monthly");
    expect(result).toMatchObject({ ok: true, source: "explicit_init" });
    expect(reads()).toHaveLength(2);
    expect(posts()).toHaveLength(1);
    const [path, options] = posts()[0];
    expect(path).toBe("/api/v1/app-subscription/apple/token/initialize");
    expect(options).toEqual({ method: "POST", body: {}, requestGuard: expect.any(Function) });
    expect(options.requestGuard()).toBe(true);
    expect(m.purchase).toHaveBeenCalledTimes(1);
    expect(m.purchase.mock.calls[0][0].appAccountToken).toBe(UUID_A);
  });
  it("doubletap while init in flight dispatches only ONE HTTP POST", async () => {
    m.offer.mockResolvedValueOnce(offer(null)).mockResolvedValueOnce(offer(UUID_A));
    const d = deferred<ReturnType<typeof initialized>>();
    m.init.mockReturnValueOnce(d.promise);
    const adapter = review();
    const first = adapter.begin("apple-monthly");
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(await adapter.begin("apple-monthly")).toEqual({
      ok: false,
      reason: "ALREADY_IN_PROGRESS",
    });
    expect(m.purchase).not.toHaveBeenCalled();
    d.resolve(initialized(UUID_A));
    expect(await first).toMatchObject({ ok: true, source: "explicit_init" });
    expect(posts()).toHaveLength(1);
  });
  it.each(["SESSION_EXPIRED", "CSRF_DENIED", "RATE_LIMITED", "INTERNAL_ERROR"])(
    "HTTP 401/403/429/500 mapped to %s: single POST, no retry and no purchase",
    async (code) => {
      m.offer.mockResolvedValue(offer(null));
      m.init.mockResolvedValueOnce({ success: false, code });
      expect(await review().begin("apple-monthly")).toEqual({
        ok: false,
        reason: "INITIALIZATION_FAILED",
      });
      expect(posts()).toHaveLength(1);
      expect(m.init).toHaveBeenCalledOnce();
      expect(m.purchase).not.toHaveBeenCalled();
    },
  );
  it("lost ACK/transport throw remains unknown without auto-retry or token logging", async () => {
    m.offer.mockResolvedValue(offer(null));
    m.init.mockRejectedValueOnce(new Error("secret-provider-token"));
    const result = await review().begin("apple-monthly");
    expect(result).toEqual({ ok: false, reason: "INITIALIZATION_FAILED" });
    expect(posts()).toHaveLength(1);
    expect(m.purchase).not.toHaveBeenCalled();
  });
  it("malformed persisted UUIDv4 from POST is rejected; client cannot generate replacement", async () => {
    m.offer.mockResolvedValue(offer(null));
    m.init.mockResolvedValueOnce(initialized("not-a-uuid"));
    expect(await review().begin("apple-monthly")).toEqual({ ok: false, reason: "TOKEN_INVALID" });
    expect(posts()).toHaveLength(1);
    expect(reads()).toHaveLength(1);
    expect(m.purchase).not.toHaveBeenCalled();
  });
  it("invalid/empty POST payload fails closed without purchase", async () => {
    m.offer.mockResolvedValue(offer(null));
    m.init.mockResolvedValueOnce({ success: true, data: {} });
    expect(await review().begin("apple-monthly")).toEqual({
      ok: false,
      reason: "INITIALIZATION_FAILED",
    });
    expect(posts()).toHaveLength(1);
    expect(m.purchase).not.toHaveBeenCalled();
  });
  it("GET offer readback mismatch or missing data blocks synthetic StoreKit callback", async () => {
    m.offer.mockResolvedValueOnce(offer(null)).mockResolvedValueOnce(offer(UUID_B));
    expect(await review().begin("apple-monthly")).toEqual({
      ok: false,
      reason: "READBACK_UNVERIFIED",
    });
    expect(posts()).toHaveLength(1);
    expect(m.purchase).not.toHaveBeenCalled();
  });
  it("A -> B -> A (new epoch) during delayed POST returns SESSION_CHANGED, old guard invalid", async () => {
    m.offer.mockResolvedValueOnce(offer(null));
    const wait = deferred<ReturnType<typeof initialized>>();
    m.init.mockReturnValueOnce(wait.promise);
    const first = review().begin("apple-monthly");
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    const guard = posts()[0][1].requestGuard as () => boolean;
    m.owner = "B";
    m.epoch = "B-E1";
    m.owner = "A";
    m.epoch = "A-E2";
    expect(guard()).toBe(false);
    wait.resolve(initialized(UUID_A));
    expect(await first).toEqual({ ok: false, reason: "SESSION_CHANGED" });
    expect(m.purchase).not.toHaveBeenCalled();
  });
  it("logout after GET before POST prevents init", async () => {
    const d = deferred<ReturnType<typeof offer>>();
    m.offer.mockReturnValueOnce(d.promise);
    const job = review().begin("apple-monthly");
    await vi.waitFor(() => expect(reads()).toHaveLength(1));
    m.authenticated = false;
    d.resolve(offer(null));
    expect(await job).toEqual({ ok: false, reason: "SESSION_CHANGED" });
    expect(posts()).toHaveLength(0);
  });
  it("same-owner fresh epoch after init before delayed GET readback cannot purchase", async () => {
    m.offer.mockResolvedValueOnce(offer(null));
    const late = deferred<ReturnType<typeof offer>>();
    m.offer.mockReturnValueOnce(late.promise);
    const job = review().begin("apple-monthly");
    await vi.waitFor(() => expect(reads()).toHaveLength(2));
    m.epoch = "E2";
    late.resolve(offer(UUID_A));
    expect(await job).toEqual({ ok: false, reason: "SESSION_CHANGED" });
    expect(m.purchase).not.toHaveBeenCalled();
  });
  it("unverified actor does not call any GET/POST or purchase", async () => {
    m.authenticated = false;
    expect(getVerifiedApplePhaseAActor()).toBeNull();
    expect(await review().begin("apple-monthly")).toEqual({ ok: false, reason: "SESSION_CHANGED" });
    expect(m.wire).not.toHaveBeenCalled();
    expect(m.purchase).not.toHaveBeenCalled();
  });
  it("API POST returns exactly one request, no identity or token supplied by client", async () => {
    const bound = () => true;
    await appSubscriptionApi.initializeAppleAppAccountToken(bound);
    expect(posts()).toHaveLength(1);
    expect(posts()[0][1]).toEqual({ method: "POST", body: {}, requestGuard: bound });
  });
});
