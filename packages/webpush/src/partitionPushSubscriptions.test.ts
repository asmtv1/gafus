import { describe, expect, it } from "vitest";

import {
  isExpoEndpoint,
  isExpoSubscription,
  isRustoreSubscription,
  partitionPushSubscriptions,
} from "./partitionPushSubscriptions";

describe("partitionPushSubscriptions", () => {
  describe("isExpoEndpoint", () => {
    it("возвращает true для ExponentPushToken", () => {
      expect(isExpoEndpoint("ExponentPushToken[xxx]")).toBe(true);
    });
    it("возвращает true для ExpoPushToken", () => {
      expect(isExpoEndpoint("ExpoPushToken[xxx]")).toBe(true);
    });
    it("возвращает false для web endpoint", () => {
      expect(isExpoEndpoint("https://fcm.googleapis.com/fcm/send/xxx")).toBe(false);
    });
  });

  describe("isExpoSubscription", () => {
    it("возвращает true когда keys.p256dh === 'expo'", () => {
      expect(
        isExpoSubscription({
          endpoint: "https://example.com",
          keys: { p256dh: "expo", auth: "x" },
        }),
      ).toBe(true);
    });
    it("возвращает true для Expo endpoint", () => {
      expect(
        isExpoSubscription({
          endpoint: "ExponentPushToken[xxx]",
          keys: { p256dh: "a", auth: "b" },
        }),
      ).toBe(true);
    });
    it("возвращает false для web подписки", () => {
      expect(
        isExpoSubscription({
          endpoint: "https://fcm.googleapis.com/fcm/send/xxx",
          keys: { p256dh: "abc", auth: "def" },
        }),
      ).toBe(false);
    });
  });

  describe("isRustoreSubscription", () => {
    it("возвращает true когда keys.p256dh === 'rustore'", () => {
      expect(
        isRustoreSubscription({
          endpoint: "https://example.com",
          keys: { p256dh: "rustore", auth: "x" },
        }),
      ).toBe(true);
    });
    it("возвращает true когда keys.auth === 'rustore'", () => {
      expect(
        isRustoreSubscription({
          endpoint: "token123",
          keys: { p256dh: "x", auth: "rustore" },
        }),
      ).toBe(true);
    });
    it("возвращает false для web подписки", () => {
      expect(
        isRustoreSubscription({
          endpoint: "https://fcm.googleapis.com/fcm/send/xxx",
          keys: { p256dh: "abc", auth: "def" },
        }),
      ).toBe(false);
    });
    it("возвращает false для expo подписки", () => {
      expect(
        isRustoreSubscription({
          endpoint: "ExponentPushToken[xxx]",
          keys: { p256dh: "expo", auth: "expo" },
        }),
      ).toBe(false);
    });
  });

  describe("partitionPushSubscriptions", () => {
    it("разделяет web и expo подписки", () => {
      const subs = [
        {
          endpoint: "https://web.example.com/push",
          keys: { p256dh: "key1", auth: "auth1" },
        },
        {
          endpoint: "ExponentPushToken[xyz]",
          keys: { p256dh: "expo", auth: "x" },
        },
      ];
      const result = partitionPushSubscriptions(subs);
      expect(result.web).toHaveLength(1);
      expect(result.expo).toHaveLength(1);
      expect(result.rustore).toHaveLength(0);
      expect(result.web[0].endpoint).toBe("https://web.example.com/push");
      expect(result.expo[0].endpoint).toBe("ExponentPushToken[xyz]");
    });

    it("подписка с keys rustore идёт в rustore массив", () => {
      const subs = [
        {
          endpoint: "rustore-token-xyz",
          keys: { p256dh: "rustore", auth: "rustore" },
        },
      ];
      const result = partitionPushSubscriptions(subs);
      expect(result.rustore).toHaveLength(1);
      expect(result.rustore[0].endpoint).toBe("rustore-token-xyz");
      expect(result.web).toHaveLength(0);
      expect(result.expo).toHaveLength(0);
    });

    it("mixed input: web + expo + rustore не пересекаются", () => {
      const subs = [
        { endpoint: "https://web.example.com", keys: { p256dh: "k1", auth: "a1" } },
        { endpoint: "ExponentPushToken[a]", keys: { p256dh: "expo", auth: "x" } },
        { endpoint: "rustore-123", keys: { p256dh: "rustore", auth: "rustore" } },
      ];
      const result = partitionPushSubscriptions(subs);
      expect(result.web).toHaveLength(1);
      expect(result.expo).toHaveLength(1);
      expect(result.rustore).toHaveLength(1);
    });

    it("отфильтровывает подписки без ключей", () => {
      const subs = [
        { endpoint: "https://x.com", keys: null },
        { endpoint: "https://y.com", keys: {} },
      ];
      const result = partitionPushSubscriptions(subs);
      expect(result.web).toHaveLength(0);
      expect(result.expo).toHaveLength(0);
      expect(result.rustore).toHaveLength(0);
    });

    it("возвращает пустые массивы для пустого ввода", () => {
      const result = partitionPushSubscriptions([]);
      expect(result.web).toEqual([]);
      expect(result.expo).toEqual([]);
      expect(result.rustore).toEqual([]);
    });
  });
});
