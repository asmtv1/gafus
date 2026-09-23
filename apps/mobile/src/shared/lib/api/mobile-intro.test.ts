import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ records: new Map<string, string>(), api: vi.fn(), id: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: vi.fn(async (key: string) => mocks.records.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { mocks.records.set(key, value); }),
} }));
vi.mock("./client", () => ({ apiClient: mocks.api }));
vi.mock("../analytics-id", () => ({ getOrCreateMobileAnalyticsId: mocks.id }));
beforeEach(() => { vi.resetModules(); mocks.records.clear(); mocks.api.mockReset().mockResolvedValue({ success: true }); mocks.id.mockResolvedValue("installation-123456"); });
describe("mobile intro event delivery", () => {
  it("does not create a cohort for a login without an intro", async () => {
    const api = await import("./mobile-intro");
    await api.trackMobileIntroAuthOutcome("LOGGED_IN", "u1");
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("deduplicates repeated opens and concurrent terminal events", async () => {
    const api = await import("./mobile-intro");
    await Promise.all([api.trackMobileIntroEvent("OPENED"), api.trackMobileIntroEvent("OPENED")]);
    await Promise.all([api.trackMobileIntroEvent("COMPLETED"), api.trackMobileIntroEvent("SKIPPED")]);
    const events = mocks.api.mock.calls.map(([, options]) => options.body.event);
    expect(events).toEqual(["OPENED", "COMPLETED"]);
  });
  it("persists offline events across restart with the original opening time", async () => {
    mocks.api.mockResolvedValue({ success: false });
    let api = await import("./mobile-intro");
    await api.trackMobileIntroEvent("OPENED");
    const original = mocks.api.mock.calls[0][1].body.openedAt;
    await api.trackMobileIntroEvent("SKIPPED");
    vi.resetModules(); api = await import("./mobile-intro");
    mocks.api.mockClear().mockResolvedValue({ success: true });
    await api.flushMobileIntroEvents();
    expect(mocks.api.mock.calls.map(([, options]) => options.body.event)).toEqual(["OPENED", "SKIPPED"]);
    expect(mocks.api.mock.calls.every(([, options]) => options.body.openedAt === original)).toBe(true);
    await api.flushMobileIntroEvents();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
  it("retains an event enqueued while a previous request is in flight", async () => {
    let release!: (value: unknown) => void;
    mocks.api.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const api = await import("./mobile-intro");
    const open = api.trackMobileIntroEvent("OPENED");
    await vi.waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
    const complete = api.trackMobileIntroEvent("COMPLETED");
    release({ success: true });
    await Promise.all([open, complete]);
    expect(mocks.api.mock.calls.map(([, options]) => options.body.event)).toEqual(["OPENED", "COMPLETED"]);
  });
  it("retries a conversion only for its original user and keeps its first outcome", async () => {
    const api = await import("./mobile-intro");
    await api.trackMobileIntroEvent("OPENED");
    mocks.api.mockResolvedValue({ success: false });
    await api.trackMobileIntroAuthOutcome("REGISTERED", "u1");
    mocks.api.mockClear().mockResolvedValue({ success: true });
    await api.flushMobileIntroEvents("u2");
    expect(mocks.api).not.toHaveBeenCalled();
    await api.trackMobileIntroAuthOutcome("LOGGED_IN", "u1");
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api.mock.calls[0][1].body.outcome).toBe("REGISTERED");
  });
});
