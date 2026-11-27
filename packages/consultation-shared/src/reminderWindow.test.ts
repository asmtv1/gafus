import { describe, expect, it } from "vitest";
import { isConsultationReminderDue } from "./reminderWindow";
const slot = { startAt: new Date("2026-11-27T12:00:00Z"), endAt: new Date("2026-11-27T12:30:00Z") };
const at = (time: string) => new Date("2026-11-27T" + time + "Z");
describe("consultation reminder freshness", () => {
  it("never sends the half-hour reminder early or after start", () => {
    expect(isConsultationReminderDue(slot, "30m", at("11:29:59"))).toBe(false);
    expect(isConsultationReminderDue(slot, "30m", at("11:30:00"))).toBe(true);
    expect(isConsultationReminderDue(slot, "30m", at("11:59:59"))).toBe(true);
    expect(isConsultationReminderDue(slot, "30m", at("12:00:00"))).toBe(false);
  });
  it("sends start reminders only during the meeting", () => {
    expect(isConsultationReminderDue(slot, "start", at("11:59:59"))).toBe(false);
    expect(isConsultationReminderDue(slot, "start", at("12:00:00"))).toBe(true);
    expect(isConsultationReminderDue(slot, "start", at("12:29:59"))).toBe(true);
    expect(isConsultationReminderDue(slot, "start", at("12:30:00"))).toBe(false);
  });
  it("fails closed for an invalid slot interval", () => {
    expect(isConsultationReminderDue({...slot,endAt:slot.startAt}, "start", slot.startAt)).toBe(false);
  });
});
