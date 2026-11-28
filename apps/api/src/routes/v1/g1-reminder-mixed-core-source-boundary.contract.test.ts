/** AG1 P0: detect stale published Core resolution for legacy vs keyed writes. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const route = readFileSync(new URL("./reminders.ts", import.meta.url), "utf8");
const applicationSource = readFileSync(
  new URL(
    "../../../../../packages/notifications-server/src/training-reminder-application.ts",
    import.meta.url,
  ),
  "utf8",
);
const applicationDist = readFileSync(
  new URL(
    "../../../../../packages/notifications-server/dist/training-reminder-application.js",
    import.meta.url,
  ),
  "utf8",
);
const storageSource = readFileSync(
  new URL(
    "../../../../../packages/notifications-server/src/training-reminder-storage.ts",
    import.meta.url,
  ),
  "utf8",
);
const storageDist = readFileSync(
  new URL(
    "../../../../../packages/notifications-server/dist/training-reminder-storage.js",
    import.meta.url,
  ),
  "utf8",
);
const keyedSource = readFileSync(
  new URL(
    "../../../../../packages/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.ts",
    import.meta.url,
  ),
  "utf8",
);
const keyedRowsSource = readFileSync(
  new URL(
    "../../../../../packages/identity-write-server/src/reminderReviewRows.ts",
    import.meta.url,
  ),
  "utf8",
);
describe("Reminder packaged boundary: shared keyed/keyless cap5", () => {
  it("P0_01 both keyed and keyless reminder CREATE lock the same User before cap and insert", () => {
    expect(applicationSource).toContain('from "./training-reminder-storage.js"');
    expect(applicationSource).toContain(
      "return createTrainingReminderRow(userId,name,reminderTime,reminderDays,timezone)",
    );
    expect(applicationSource).not.toContain('from "@gafus/prisma"');
    expect(keyedSource).toContain("requireReminderAG4ReviewRowsPort(port)");
    expect(keyedSource).not.toContain("@gafus/identity-write-server/reminder-review-rows");
    const adapterComposer=readFileSync(new URL("../../modules/reminders/composition/reminder-rows.ts",import.meta.url),"utf8");
    expect(adapterComposer).toContain("@gafus/identity-write-server/reminder-review-rows");
    for (const impl of [storageSource, keyedRowsSource]) {
      expect(impl).toContain('AND "registrationPending" = false FOR UPDATE');
      expect(impl).toContain("prisma.$transaction(async");
      expect(impl).toContain("tx.reminder.count");
      expect(impl).toContain("tx.reminder.create");
    }
    expect(storageSource).toContain("if(count>=MAX_REMINDERS)");
    expect(storageSource).toContain("MAX_REMINDERS=5");
    expect(storageSource).toContain("type:REMINDER_TYPE");
  });
  it("P0_02 compiled application delegates to owner-locked storage", () => {
    expect(applicationDist).toContain('"./training-reminder-storage.js"');
    expect(applicationDist).toContain(
      "createTrainingReminderRow(userId, name, reminderTime, reminderDays, timezone)",
    );
    expect(applicationDist).not.toContain('"@gafus/prisma"');
    expect(storageDist).toContain('AND "registrationPending" = false FOR UPDATE');
    expect(storageDist).toContain("$transaction(");
    expect(storageDist).toContain("tx.reminder.count");
    expect(storageDist).toContain("tx.reminder.create");
  });
  it("P0_03 keyed and legacy flows use their published packages", () => {
    expect(route).toContain('} from "@gafus/core/services/reminders";');
    expect(route).toContain('import {getReminders,createReminder,updateReminder,deleteReminder} from "@gafus/notifications-server/training-reminder-application";');
    expect(route).toContain("  createReminderAG4,");
    expect(route).not.toContain("packages/core/src/services/reminders/");
    const lookup = readFileSync(
      new URL("./g1-reminder-operation-lookupAG4.review.ts", import.meta.url),
      "utf8",
    );
    expect(lookup).toContain('} from "@gafus/core/services/reminders";');
    expect(lookup).not.toContain("packages/core/src/services/reminders/");
  });
});
