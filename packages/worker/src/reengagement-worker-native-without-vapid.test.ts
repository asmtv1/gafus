import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  jobs: new Map<string, (job: unknown) => Promise<void>>(),
  fromEnv: vi.fn(() => {throw Error("TEST_NO_VAPID");}),
  typeList: [] as string[],
  expo: vi.fn(),
  rustore: vi.fn(),
  web: vi.fn(),
  recorded: vi.fn(),
  deleteEndpoints: vi.fn(),
  log: vi.fn(),
  exit: vi.fn(),
}));
vi.mock("bullmq", () => ({
  Worker: class {
    constructor(name: string, processor: (job: unknown) => Promise<void>) {
      state.jobs.set(name, processor);
    }
    on() { return this; }
  },
}));
vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({
    info: state.log, warn: state.log, success: state.log, error: state.log,
  }),
}));
vi.mock("@gafus/queues", () => ({ connection: {} }));
vi.mock("@gafus/core/services/reengagement", () => ({
  getReengagementCampaignState: async () => ({
    isActive: true, returned: false, unsubscribed: false,
  }),
  getReengagementPushSubscriptions: async () => state.typeList.map((type: string) => ({
    endpoint: type === "web" ? "https://example.invalid/owned" : "synthetic-"+type,
    keys: { p256dh: type, auth: type },
  })),
  deleteInvalidReengagementPushEndpoints: (...args: unknown[]) => state.deleteEndpoints(...args),
  isReengagementDispatchAllowed: async () => true,
}));
vi.mock("@gafus/webpush", () => ({
  PushNotificationService: {
    fromEnvironment: () => state.fromEnv(),
    shouldDeleteSubscription: () => false,
  },
  partitionPushSubscriptions: (subs: { keys: { p256dh: string } }[]) => ({
    web: subs.filter(x => x.keys.p256dh === "web"),
    expo: subs.filter(x => x.keys.p256dh === "expo"),
    rustore: subs.filter(x => x.keys.p256dh === "rustore"),
  }),
  sendExpoPushNotifications: (...args: unknown[]) => state.expo(...args),
  sendRustorePushNotifications: (...args: unknown[]) => state.rustore(...args),
}));
vi.mock("@gafus/reengagement", () => ({
  getCampaignData: async () => ({ sentVariantIds: [] }),
  updateCampaignAfterSend: (...args: unknown[]) => state.recorded(...args),
  createNotificationRecord: async () => "synthetic-notification",
  closeCampaign: vi.fn(),
  collectUserData: async () => ({ name: "Собака" }),
  selectMessageVariant: () => ({ id: "variant", type: "TEXT" }),
  personalizeMessage: () => ({
    title: "Тренировка", body: "Пора потренироваться", url: "/courses", data: {},
  }),
  validatePersonalizedMessage: () => true,
}));

async function startupAndSend() {
  await import("./reengagement-worker");
  const run = state.jobs.get("reengagement");
  expect(run).toBeTypeOf("function");
  await run?.({ id: "synthetic-job", data: {
    campaignId: "synthetic-campaign", userId: "synthetic-owner", level: 1,
  } });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.jobs.clear();
  state.typeList = [];
  const delivered = {
    successCount: 1, failureCount: 0, deletedCount: 0, temporaryFailureCount: 0,
  };
  state.expo.mockResolvedValue(delivered);
  state.rustore.mockResolvedValue(delivered);
  state.recorded.mockResolvedValue(undefined);
  state.exit.mockImplementation(() => {throw Error("WORKER_MUST_NOT_EXIT");});
  vi.spyOn(process, "exit").mockImplementation(state.exit as never);
});

afterEach(() => { vi.restoreAllMocks(); });

describe("reengagement worker startup/transport safety with no VAPID", () => {
  it("starts and sends Expo-only push without loading WebPush keys", async () => {
    state.typeList = ["expo"];
    await startupAndSend();
    expect(state.exit).not.toHaveBeenCalled();
    expect(state.fromEnv).not.toHaveBeenCalled();
    expect(state.expo).toHaveBeenCalledOnce();
    expect(state.recorded).toHaveBeenCalledWith(
      "synthetic-campaign", "synthetic-notification", 1, 0,
    );
  });

  it("does not mark an unconfigured WebPush-only job as delivered", async () => {
    state.typeList = ["web"];
    await expect(startupAndSend()).rejects.toThrow("REENGAGEMENT_WEBPUSH_UNAVAILABLE");
    expect(state.fromEnv).toHaveBeenCalledOnce();
    expect(state.expo).not.toHaveBeenCalled();
    expect(state.rustore).not.toHaveBeenCalled();
    expect(state.recorded).not.toHaveBeenCalled();
    expect(state.deleteEndpoints).not.toHaveBeenCalled();
  });

  it("a WebPush configuration error must not suppress an independent RuStore send", async () => {
    state.typeList = ["web", "rustore"];
    await startupAndSend();
    expect(state.exit).not.toHaveBeenCalled();
    expect(state.fromEnv).toHaveBeenCalledOnce();
    expect(state.rustore).toHaveBeenCalledOnce();
    expect(state.deleteEndpoints).not.toHaveBeenCalled();
    expect(state.recorded).toHaveBeenCalledWith(
      "synthetic-campaign", "synthetic-notification", 1, 1,
    );
  });
});
