import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  types: [] as ("expo" | "web")[],
  initWeb: vi.fn(() => { throw Error("Synthetic missing WebPush VAPID"); }),
  sendExpo: vi.fn(),
  claim: vi.fn(), ack: vi.fn(), release: vi.fn(),
}));

vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({info:vi.fn(),warn:vi.fn(),error:vi.fn(),success:vi.fn()}),
}));
vi.mock("@gafus/core/services/reminders", () => ({
  shouldSendTrainingReminder: () => true,
  trainingReminderLocalDayKey: () => "2026-11-07",
  getTrainingReminderLocalTime: () => ({ year: 2026, month: 11, day: 7 }),
  trainingReminderAlreadySentToday: () => false,
}));
vi.mock("@gafus/notifications-server/training-reminder-delivery", () => ({
  createTrainingReminderDeliveryRepository: () => ({
    listRetryableTrainingReminderCandidates: async () => [],
    claimDailyTrainingReminderDelivery: (...args: unknown[]) => state.claim(...args),
    acknowledgeDailyTrainingReminderDelivery: (...args: unknown[]) => state.ack(...args),
    releaseDailyTrainingReminderDelivery: (...args: unknown[]) => state.release(...args),
  }),
}));
vi.mock("@gafus/notifications-server/trainingReminderClaims", () => ({
  listActiveTrainingReminderCandidates: async () => [{
    id: "synthetic-reminder", userId: "synthetic-owner", name: "Сделать упражнения",
    timezone: "Europe/Samara", reminderTime: "15:00", reminderDays: null, lastSentAt: null,
  }],
  getTrainingReminderPushSubscriptions: async () => state.types.map(type => ({
    endpoint: type === "web" ? "https://example.invalid/web-test" : "ExpoPushToken[synthetic]",
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
  }),
  sendExpoPushNotifications: (...args: unknown[]) => state.sendExpo(...args),
}));

import { sendTrainingReminders } from "./training-reminders-sender";

beforeEach(() => {
  state.types=[];
  state.initWeb.mockClear(); state.sendExpo.mockReset();
  state.claim.mockReset().mockResolvedValue("fake-lease");
  state.ack.mockReset().mockResolvedValue(true);
  state.release.mockReset().mockResolvedValue(true);
  state.sendExpo.mockResolvedValue({
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
