/** AG1 P0: detect stale published Core resolution for legacy vs keyed writes. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const route = readFileSync(new URL("./reminders.ts", import.meta.url), "utf8");
const coreSource = readFileSync(new URL(
  "../../../../../packages/core/src/services/reminders/reminderService.ts", import.meta.url), "utf8");
const coreDist = readFileSync(new URL(
  "../../../../../packages/core/dist/core/src/services/reminders/reminderService.js", import.meta.url), "utf8");
const keyedSource = readFileSync(new URL(
  "../../../../../packages/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.ts", import.meta.url), "utf8");
describe("Reminder actual Core module boundary: mixed keyed/keyless cap5", () => {
  it("P0_01 original keyed and keyless Core source both lock same owner User row", () => {
    expect(coreSource).toContain("AND \"registrationPending\" = false FOR UPDATE");
    expect(keyedSource).toContain("AND \"registrationPending\" = false FOR UPDATE");
    expect(coreSource).toContain("return prisma.$transaction(async (tx) => {");
    expect(keyedSource).toContain("return await prisma.$transaction(async (tx) => {");
    expect(coreSource).toContain("await tx.reminder.count");
    expect(keyedSource).toContain("await tx.reminder.count");
  });
  it("P0_02 AG4 built Core legacy module must have owner lock", () => {
    expect(coreDist).toContain("FOR UPDATE");
    expect(coreDist).toContain("$transaction(");
  });
  it("P0_03 keyed/keyless GET all import one published compiled Core package", () => {
    expect(route).toContain('} from "@gafus/core/services/reminders";');
    expect(route).toContain("  createReminder,");
    expect(route).toContain("  createReminderAG4,");
    expect(route).not.toContain("packages/core/src/services/reminders/");
    const lookup = readFileSync(new URL("./g1-reminder-operation-lookupAG4.review.ts", import.meta.url), "utf8");
    expect(lookup).toContain('} from "@gafus/core/services/reminders";');
    expect(lookup).not.toContain("packages/core/src/services/reminders/");
  });
});
