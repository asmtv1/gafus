import { describe, expect, it } from "vitest";
import { isChatWorkingTime, nextChatReminder } from "./reminder-time";
describe("chat reminders in Moscow", () => {
  it.each([
    ["2026-10-02T11:59:59Z", "2026-10-02T16:59:59Z"],
    ["2026-10-02T12:00:00Z", "2026-10-03T11:00:00Z"],
    ["2026-10-03T10:00:00Z", "2026-10-03T15:00:00Z"],
    ["2026-10-04T06:00:00Z", "2026-10-04T11:00:00Z"],
    ["2026-10-04T12:00:00Z", "2026-10-06T11:00:00Z"],
    ["2026-10-05T06:00:00Z", "2026-10-06T11:00:00Z"],
    ["2026-10-06T05:59:59Z", "2026-10-06T11:00:00Z"],
  ])("rolls %s to %s", (from, to) => {
    expect(nextChatReminder(new Date(from)).toISOString()).toBe(new Date(to).toISOString());
  });
  it.each([
    ["2026-10-03T10:59:59Z", false],
    ["2026-10-03T11:00:00Z", true],
    ["2026-10-04T16:59:59Z", true],
    ["2026-10-04T17:00:00Z", false],
    ["2026-10-05T12:00:00Z", false],
    ["2026-10-06T11:00:00Z", true],
  ])("checks working window %s", (time, expected) => {
    expect(isChatWorkingTime(new Date(time))).toBe(expected);
  });
});
