import { describe, expect, it } from "vitest";
import { nextChatReminder } from "./reminder-time";
describe("chat reminders in Moscow", () => {
  it.each([
    ["2026-10-02T15:59:59Z", "2026-10-05T06:00:00Z"],
    ["2026-10-02T12:59:59Z", "2026-10-02T17:59:59Z"],
    ["2026-10-02T13:00:00Z", "2026-10-05T06:00:00Z"],
    ["2026-10-03T10:00:00Z", "2026-10-05T06:00:00Z"],
    ["2026-10-05T00:59:59Z", "2026-10-05T06:00:00Z"],
    ["2026-10-05T01:00:00Z", "2026-10-05T06:00:00Z"],
    ["2026-10-05T06:00:00Z", "2026-10-05T11:00:00Z"],
    ["2026-10-05T16:00:00Z", "2026-10-06T06:00:00Z"],
  ])("rolls %s to %s", (from, to) => {
    expect(nextChatReminder(new Date(from)).toISOString()).toBe(new Date(to).toISOString());
  });
});
