import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  types: [] as ("expo" | "web" | "rustore")[],
  initWeb: vi.fn(() => { throw Error("Synthetic missing WebPush VAPID"); }),
  sendExpo: vi.fn(),
  sendRustore: vi.fn(),
  claim: vi.fn(), ack: vi.fn(), release: vi.fn(),
}));

vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({info:vi.fn(),warn:vi.fn(),error:vi.fn(),success:vi.fn()}),
}));
vi.mock("@gafus/core/services/reminders", () => ({
  shouldSendTrainingReminder: () => true,
  listActiveTrainingReminderCandidates: async () => [{
    id: "synthetic-reminder", userId: "synthetic-owner", name: "Сделать упражнения",
    timezone: "Europe/Samara", reminderTime: "15:00", reminderDays: null, lastSentAt: null,
  }],
  listRetryableTrainingReminderCandidates: async () => [],
  claimDailyTrainingReminderDelivery: (...args: unknown[]) => state.claim(...args),
  acknowledgeDailyTrainingReminderDelivery: (...args: unknown[]) => state.ack(...args),
  releaseDailyTrainingReminderDelivery: (...args: unknown[]) => state.release(...args),
  getTrainingReminderPushSubscriptions: async () => state.types.map(type => ({
    endpoint: type === "web" ? "https://example.invalid/web-test" :
      type === "expo" ? "ExpoPushToken[synthetic]" : "synthetic-rustore-token",
    keys: {p256dh: type, auth: type},
  })),
  removeInvalidTrainingReminderEndpoints: vi.fn(),
}));
vi.mock("@gafus/webpush", () => ({
  PushNotificationService: {
    fromEnvironment: () => state.initWeb(),
    shouldDeleteSubscription: () => false,
  },
  partitionPushSubscriptions: (subs: {endpoint:string;keys:{p256dh:string;auth:string}}[]) => ({
    web: subs.filter(row => row.keys.p256dh === "web"),
    expo: subs.filter(row => row.keys.p256dh === "expo"),
    rustore: subs.filter(row => row.keys.p256dh === "rustore"),
  }),
  sendExpoPushNotifications: (...args: unknown[]) => state.sendExpo(...args),
  sendRustorePushNotifications: (...args: unknown[]) => state.sendRustore(...args),
}));

import { sendTrainingReminders } from "./training-reminders-sender";

beforeEach(() => {
  state.types=[];
  state.initWeb.mockClear(); state.sendExpo.mockReset(); state.sendRustore.mockReset();
  state.claim.mockReset().mockResolvedValue("fake-lease");
  state.ack.mockReset().mockResolvedValue(true);
  state.release.mockReset().mockResolvedValue(true);
  state.sendExpo.mockResolvedValue({
    successCount: 1, failureCount: 0, deletedCount: 0, temporaryFailureCount: 0,
  });
  state.sendRustore.mockResolvedValue({
    successCount: 1, failureCount: 0, deletedCount: 0, temporaryFailureCount: 0,
  });
});

describe("training reminder device transport isolation with NO external providers", () => {
  it("Expo-only gets ACK even with missing WebPush VAPID", async () => {
    state.types=["expo"];
    expect(await sendTrainingReminders()).toEqual({sent:1,skipped:0,errors:0});
    expect(state.initWeb).not.toHaveBeenCalled();
    expect(state.sendExpo).toHaveBeenCalledTimes(1);
    expect(state.ack).toHaveBeenCalledTimes(1);
    expect(state.release).not.toHaveBeenCalled();
  });
  it("Rustore-only gets ACK without WebPush initialization", async () => {
    state.types=["rustore"];
    expect(await sendTrainingReminders()).toEqual({sent:1,skipped:0,errors:0});
    expect(state.initWeb).not.toHaveBeenCalled();
    expect(state.sendRustore).toHaveBeenCalledTimes(1);
    expect(state.ack).toHaveBeenCalledTimes(1);
  });
  it("web failure cannot suppress independent Expo send", async () => {
    state.types=["web","expo"];
    expect(await sendTrainingReminders()).toEqual({sent:1,skipped:0,errors:0});
    expect(state.initWeb).toHaveBeenCalledOnce();
    expect(state.sendExpo).toHaveBeenCalledOnce();
    expect(state.ack).toHaveBeenCalledOnce();
  });
  it("web-only without VAPID stays retryable; no fake SENT", async () => {
    state.types=["web"];
    expect(await sendTrainingReminders()).toEqual({sent:0,skipped:0,errors:1});
    expect(state.initWeb).toHaveBeenCalledOnce();
    expect(state.ack).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledOnce();
  });
});
