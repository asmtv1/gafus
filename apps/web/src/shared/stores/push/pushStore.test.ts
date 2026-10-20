import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  getRegistration: vi.fn(),
  getSubscriptions: vi.fn(),
  updateSubscription: vi.fn(),
  getPublicKey: vi.fn(),
}));

vi.mock("@gafus/error-handling", () => ({ reportClientError: vi.fn() }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
vi.mock("@shared/utils/serviceWorkerManager", () => ({
  default: {
    isSupported: () => true,
    register: mocks.register,
    getRegistration: mocks.getRegistration,
  },
}));
vi.mock("@shared/lib/actions/subscription", () => ({
  updateSubscriptionAction: mocks.updateSubscription,
  deleteSubscriptionAction: vi.fn(),
}));
vi.mock("@shared/lib/savePushSubscription/getUserSubscriptionStatus", () => ({
  getUserSubscriptions: mocks.getSubscriptions,
}));
vi.mock("@shared/lib/actions/publicKey", () => ({ getPublicKeyAction: mocks.getPublicKey }));

import { usePushStore } from "./pushStore";

const validVapidKey = Buffer.alloc(65, 9).toString("base64url");
const makeSubscription = (endpoint: string, unsubscribe = vi.fn(async () => true)) => ({
  endpoint,
  unsubscribe,
  getKey: () => Uint8Array.from([1, 2, 3]).buffer,
});

let stale: ReturnType<typeof makeSubscription>;
let fresh: ReturnType<typeof makeSubscription>;
let pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("navigator", { serviceWorker: {} });
  vi.stubGlobal("window", {
    PushManager: {},
    atob: (s: string) => Buffer.from(s, "base64").toString("binary"),
  });
  vi.stubGlobal("Notification", { permission: "granted" });
  stale = makeSubscription("https://fcm.example/expired");
  fresh = makeSubscription("https://fcm.example/fresh");
  pushManager = {
    getSubscription: vi.fn().mockResolvedValue(stale),
    subscribe: vi.fn().mockResolvedValue(fresh),
  };
  mocks.register.mockResolvedValue({ pushManager });
  mocks.getRegistration.mockResolvedValue({ pushManager });
  mocks.getSubscriptions.mockResolvedValue({ subscriptions: [] });
  mocks.updateSubscription.mockResolvedValue({ success: true });
  mocks.getPublicKey.mockResolvedValue({ publicKey: validVapidKey });
  usePushStore.setState({
    subscription: null,
    hasServerSubscription: false,
    isLoading: false,
    error: null,
    disabledByUser: false,
    userId: "trainer-1",
  });
});

describe("web push subscription recovery", () => {
  it("replaces an expired FCM endpoint instead of re-saving it", async () => {
    await usePushStore.getState().setupPushSubscription(validVapidKey);

    expect(stale.unsubscribe).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
    expect(mocks.updateSubscription).toHaveBeenCalledOnce();
    expect(mocks.updateSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "trainer-1", endpoint: fresh.endpoint }),
    );
    expect(usePushStore.getState().hasServerSubscription).toBe(true);
  });

  it("does not replace a healthy endpoint already registered on the server", async () => {
    mocks.getSubscriptions.mockResolvedValue({ subscriptions: [{ endpoint: stale.endpoint }] });

    await usePushStore.getState().setupPushSubscription(validVapidKey);

    expect(stale.unsubscribe).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(mocks.updateSubscription).not.toHaveBeenCalled();
    expect(usePushStore.getState().hasServerSubscription).toBe(true);
  });

  it("recovers automatically when browser permission is already granted", async () => {
    await usePushStore.getState().ensureActiveSubscription();

    expect(stale.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.updateSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: fresh.endpoint }),
    );
  });

  it("never restores a server subscription when unsubscribing the stale endpoint fails", async () => {
    stale.unsubscribe.mockResolvedValue(false);

    await usePushStore.getState().setupPushSubscription(validVapidKey);

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(mocks.updateSubscription).not.toHaveBeenCalled();
    expect(usePushStore.getState().hasServerSubscription).toBe(false);
    expect(usePushStore.getState().error).toContain("устаревшую");
  });

  it("does not report an unsaved token as active", async () => {
    mocks.updateSubscription.mockResolvedValue({ success: false });

    await usePushStore.getState().setupPushSubscription(validVapidKey);

    expect(usePushStore.getState().hasServerSubscription).toBe(false);
    expect(usePushStore.getState().error).toContain("сохранить");
  });

  it("runs only one recovery when two initializers fire before the key is loaded", async () => {
    let resolveKey!: (value: { publicKey: string }) => void;
    mocks.getPublicKey.mockReturnValue(new Promise((resolve) => { resolveKey = resolve; }));

    const first = usePushStore.getState().ensureActiveSubscription();
    const second = usePushStore.getState().ensureActiveSubscription();
    resolveKey({ publicKey: validVapidKey });
    await Promise.all([first, second]);

    expect(mocks.getPublicKey).toHaveBeenCalledOnce();
    expect(stale.unsubscribe).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
  });

  it("respects intentional user disable on automatic recovery", async () => {
    usePushStore.setState({ disabledByUser: true });

    await usePushStore.getState().ensureActiveSubscription();

    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.updateSubscription).not.toHaveBeenCalled();
  });
});
