import { describe, expect, it, vi } from "vitest";

import { getUserPreferences, updateUserPreferences } from "./preferencesService";

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("getUserPreferences", () => {
  it("returns object with notifications, sound, interface, privacy keys", async () => {
    const result = await getUserPreferences("user-1");
    expect(result).toHaveProperty("notifications");
    expect(result).toHaveProperty("sound");
    expect(result).toHaveProperty("interface");
    expect(result).toHaveProperty("privacy");
  });

  it("returns default values for notifications", async () => {
    const result = await getUserPreferences("user-1");
    expect(result.notifications).toEqual({
      push: true,
      email: false,
      sms: false,
    });
  });

  it("returns default values for sound", async () => {
    const result = await getUserPreferences("user-1");
    expect(result.sound.enabled).toBe(true);
    expect(result.sound.volume).toBe(0.7);
    expect(result.sound.trainingSounds).toBe(true);
    expect(result.sound.achievementSounds).toBe(true);
  });

  it("accepts any userId without throwing", async () => {
    const result = await getUserPreferences("user-abc");
    expect(result).toBeDefined();
  });
});

describe("updateUserPreferences", () => {
  it("merges partial notifications update", async () => {
    const result = await updateUserPreferences("user-1", {
      notifications: { push: false },
    });
    expect(result.notifications.push).toBe(false);
    expect(result.notifications.email).toBe(false);
    expect(result.notifications.sms).toBe(false);
  });

  it("returns all defaults when empty preferences", async () => {
    const result = await updateUserPreferences("user-1", {});
    expect(result.notifications.push).toBe(true);
    expect(result.sound.enabled).toBe(true);
    expect(result.interface.autoPlay).toBe(false);
    expect(result.privacy.showProfile).toBe(true);
  });

  it("merges deep partial for nested keys", async () => {
    const result = await updateUserPreferences("user-1", {
      sound: { volume: 0.5, achievementSounds: false },
    });
    expect(result.sound.volume).toBe(0.5);
    expect(result.sound.achievementSounds).toBe(false);
    expect(result.sound.enabled).toBe(true);
    expect(result.sound.trainingSounds).toBe(true);
  });
});
