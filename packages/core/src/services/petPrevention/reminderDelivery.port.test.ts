import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ due: vi.fn(), ack: vi.fn(), push: vi.fn(), error: vi.fn() }));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: m.error }) }));
import { checkAndSendPetPreventionReminders } from "./reminderDelivery";
const reminder = {
  id: "p1",
  ownerId: "ownerA",
  petId: "dogA",
  petName: "Малыш",
  type: "VACCINATION",
  productName: "Вакцина",
  notes: "Синтетическая заметка",
  remindAt: new Date("2026-11-09T00:00:00Z"),
  reminderTimes: ["09:00", "19:00"],
  sentTimesForRemindAt: [],
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T12:00:00Z")); // 15:00 Moscow
  vi.clearAllMocks();
  m.due.mockResolvedValue([{ ...reminder }]);
  m.ack.mockResolvedValue({ id: "p1" });
  m.push.mockResolvedValue({ queued: true });
});
afterEach(() => vi.useRealTimers());
describe("pet-prevention Core delivery vs isolated DB persistence", () => {
  it("queues only due HH:MM, notifies exact owner, and persists only queued times", async () => {
    expect(
      await checkAndSendPetPreventionReminders({
        enqueue: m.push,
        readDue: m.due,
        acknowledge: m.ack,
      }),
    ).toEqual({
      sent: 1,
      errors: 0,
    });
    expect(m.push).toHaveBeenCalledExactlyOnceWith({
      userId: "ownerA",
      title: "Процедуры",
      body: "Прививка — Малыш: Вакцина\nСинтетическая заметка",
      url: "/profile/pets/dogA/prevention",
    });
    expect(m.ack).toHaveBeenCalledExactlyOnceWith(reminder, ["09:00"], false);
  });
  it("does not acknowledge an unqueued push as delivered", async () => {
    m.push.mockResolvedValue({ queued: false });
    expect(
      await checkAndSendPetPreventionReminders({
        enqueue: m.push,
        readDue: m.due,
        acknowledge: m.ack,
      }),
    ).toEqual({
      sent: 0,
      errors: 0,
    });
    expect(m.ack).toHaveBeenCalledExactlyOnceWith(reminder, [], false);
  });
  it("records a failed enqueue without accepting any delivery receipt", async () => {
    m.push.mockRejectedValue(new Error("QUEUE_UNAVAILABLE"));
    expect(
      await checkAndSendPetPreventionReminders({
        enqueue: m.push,
        readDue: m.due,
        acknowledge: m.ack,
      }),
    ).toEqual({
      sent: 0,
      errors: 1,
    });
    expect(m.ack).not.toHaveBeenCalled();
    expect(m.error).toHaveBeenCalledOnce();
  });
  it("later Moscow slot completes only the still-pending time", async () => {
    vi.setSystemTime(new Date("2026-11-09T17:00:00Z")); // 20:00 Moscow
    m.due.mockResolvedValue([{ ...reminder, sentTimesForRemindAt: ["09:00"] }]);
    expect(
      await checkAndSendPetPreventionReminders({
        enqueue: m.push,
        readDue: m.due,
        acknowledge: m.ack,
      }),
    ).toEqual({
      sent: 1,
      errors: 0,
    });
    expect(m.ack).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "ownerA" }),
      ["09:00", "19:00"],
      true,
    );
  });
});
