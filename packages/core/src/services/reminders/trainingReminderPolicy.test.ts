import { describe, expect, it } from "vitest";
import {
  getTrainingReminderLocalTime,
  trainingReminderMatchesDay,
  trainingReminderMatchesTime,
  trainingReminderAlreadySentToday,
  shouldSendTrainingReminder,
} from "./trainingReminderPolicy";

describe("training reminder policy lives in core", () => {
  it("uses the user's IANA timezone rather than server local time", () => {
    const local = getTrainingReminderLocalTime("Europe/Moscow", new Date("2026-10-11T06:30:00.000Z"));
    expect(local).toMatchObject({ hour: 9, minute: 30, dayOfWeek: 0, year: 2026, month: 10, day: 11 });
  });
  it("maps Sunday to 7 and checks selected weekdays", () => {
    expect(trainingReminderMatchesDay("1, 7", 0)).toBe(true);
    expect(trainingReminderMatchesDay("1, 3", 0)).toBe(false);
    expect(trainingReminderMatchesDay(null, 0)).toBe(true);
  });
  it("rejects malformed HH:mm and matches within 5 minutes", () => {
    expect(trainingReminderMatchesTime("09:30", 9, 34)).toBe(true);
    expect(trainingReminderMatchesTime("09:30", 9, 36)).toBe(false);
    expect(trainingReminderMatchesTime("bad", 9, 30)).toBe(false);
    expect(trainingReminderMatchesTime("99:30", 9, 30)).toBe(false);
  });
  it("deduplicates by local calendar day across UTC midnight", () => {
    const last = new Date("2026-10-10T22:55:00.000Z");
    const local = getTrainingReminderLocalTime("Europe/Moscow", new Date("2026-10-11T06:30:00.000Z"));
    expect(trainingReminderAlreadySentToday(last, "Europe/Moscow", local)).toBe(true);
    expect(shouldSendTrainingReminder({
      timezone: "Europe/Moscow",
      reminderDays: "7",
      reminderTime: "09:30",
      lastSentAt: last,
    }, new Date("2026-10-11T06:30:00.000Z"))).toBe(false);
  });
  it("allows an eligible previously unsent reminder", () => {
    expect(shouldSendTrainingReminder({
      timezone: "Europe/Moscow",
      reminderDays: "7",
      reminderTime: "09:30",
      lastSentAt: null,
    }, new Date("2026-10-11T06:30:00.000Z"))).toBe(true);
  });
});
