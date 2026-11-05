import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
  scheduleNotificationAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));
import { finishWalk, pauseWalk, resumeWalk, startWalk } from "./walkModel";
import { planWalkAlerts } from "./walkNotifications";

describe("dog walk native alert planning", () => {
  it("schedules countdown ending with the OS default notification sound", () => {
    const walk = startWalk("countdown", 0, 900);
    expect(planWalkAlerts(walk, 0)).toEqual([{ kind: "countdown", secondsFromNow: 900 }]);
    expect(planWalkAlerts(walk, 900_000)).toEqual([]);
  });

  it("pauses and resumes countdown remaining time without reminders during pause", () => {
    const walk = pauseWalk(startWalk("countdown", 0, 600), 120_000);
    expect(planWalkAlerts(walk, 3_600_000)).toEqual([]);
    expect(planWalkAlerts(resumeWalk(walk, 3_600_000), 3_600_000)).toEqual([
      { kind: "countdown", secondsFromNow: 480 },
    ]);
  });

  it("standard timer alerts after each 30 minutes of actual walking", () => {
    const walk = startWalk("stopwatch", 0);
    const plan = planWalkAlerts(walk, 0);
    expect(plan[0]).toEqual({ kind: "milestone", secondsFromNow: 1800, milestoneMinutes: 30 });
    expect(plan[1]).toEqual({ kind: "milestone", secondsFromNow: 3600, milestoneMinutes: 60 });
    expect(plan).toHaveLength(24);
    const resumed = resumeWalk(pauseWalk(walk, 1_500_000), 10_000_000);
    expect(planWalkAlerts(resumed, 10_000_000)[0]).toEqual({
      kind: "milestone",
      secondsFromNow: 300,
      milestoneMinutes: 30,
    });
    expect(planWalkAlerts(finishWalk(resumed, 10_000_000), 10_000_000)).toEqual([]);
  });
});

describe("scheduled walk notification lifecycle", () => {
  it("removes previous countdown alert when the user pauses", async () => {
    const storage = (await import("@react-native-async-storage/async-storage")).default;
    const notifications = await import("expo-notifications");
    const state = new Map<string, string>();
    vi.mocked(storage.getItem).mockImplementation(async (key) => state.get(key) ?? null);
    vi.mocked(storage.setItem).mockImplementation(async (key, value) => {
      state.set(key, value);
    });
    vi.mocked(storage.removeItem).mockImplementation(async (key) => {
      state.delete(key);
    });
    vi.mocked(notifications.scheduleNotificationAsync).mockResolvedValue("n1");
    const { syncWalkNotifications } = await import("./walkNotifications");
    const walk = startWalk("countdown", 0, 1800);
    await syncWalkNotifications("owner", walk, true, 0);
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    await syncWalkNotifications("owner", pauseWalk(walk, 5000), true, 5000);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("n1");
    expect(state.size).toBe(0);
  });

  it("does not schedule alerts when notification permission is denied", async () => {
    const { syncWalkNotifications } = await import("./walkNotifications");
    const notifications = await import("expo-notifications");
    vi.mocked(notifications.scheduleNotificationAsync).mockClear();
    await syncWalkNotifications("owner", startWalk("stopwatch", 100), false, 100);
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
