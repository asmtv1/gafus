/** AG1 P0: future packaged import must unify both Reminder CREATE paths.
 * Source/exports only; cannot certify shared compiled dist before AG4 build.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const root = new URL("../../../../../", import.meta.url);
const text = (path: string) => readFileSync(new URL(path, root), "utf8");
const pkg = JSON.parse(text("packages/core/package.json")) as {
  exports: Record<string, { default: string }>;
  scripts: { build: string };
};
const patch = text(
  "apps/api/src/test/fixtures/reminder-review/AG1_REMINDER_P0_PACKAGED_ENTRYPOINT_CREATE_AND_LOOKUP_UNIFIED_AG4_EXCLUSIVE_BUILD.REVIEW.v2.patch",
);
const plan = JSON.parse(
  text(
    "apps/api/src/test/fixtures/reminder-review/AG1_REMINDER_P0_PACKAGED_ENTRYPOINT_CREATE_AND_LOOKUP_CONTRACT.v2.json",
  ),
) as {
  state: string;
  afterReviewSHA256: Record<string, string>;
};
const apiBuild = text("apps/api/tsup.config.ts");
const legacyApplication = text("packages/notifications-server/src/training-reminder-application.ts");
const storage = text("packages/notifications-server/src/training-reminder-storage.ts");
const keyed = text("packages/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.ts");
const keyedSql = text("packages/identity-write-server/src/reminderReviewRows.ts");
const gate = text(
  "apps/api/src/test/fixtures/reminder-review/ag1-reminder-packaged-core-exports-no-sql-gate.mjs",
);

describe("P0 packaged Core exports/build review; real SQL belongs to AG4", () => {
  it("B01 records the original two-CREATE review and the current keyed package export", () => {
    expect(patch).toContain('export * from "./g1ReminderMutationReceiptAG4.review";');
    expect(patch).toContain("  createReminder,");
    expect(patch).toContain("  createReminderAG4,");
    expect(patch).toContain('} from "@gafus/core/services/reminders";');
    expect(pkg.exports["./services/reminders"]?.default).toBe(
      "./dist/core/src/services/reminders/index.js",
    );
    expect(plan.afterReviewSHA256).toHaveProperty("apps/api/src/routes/v1/reminders.ts");
    expect(plan.afterReviewSHA256).toHaveProperty("packages/core/src/services/reminders/index.ts");
    expect(plan.afterReviewSHA256).toHaveProperty(
      "apps/api/src/routes/v1/g1-reminder-operation-lookupAG4.review.ts",
    );
    expect(patch).toContain("lookupReminderAG4, ReminderInvalidError, ReminderUnknownError,");
  });
  it("B02 both legacy and keyed CREATE use identical owner lock with cap5 inside one transaction", () => {
    expect(legacyApplication).toContain('from "./training-reminder-storage.js"');
    expect(legacyApplication).toContain(
      "return createTrainingReminderRow(userId,name,reminderTime,reminderDays,timezone)",
    );
    expect(legacyApplication).not.toContain('from "@gafus/prisma"');
    expect(keyed).toContain("requireReminderAG4ReviewRowsPort()");
    expect(keyed).not.toContain("@gafus/identity-write-server/reminder-review-rows");
    const adapterComposer=text("apps/api/src/modules/reminders/composition/install-ag4-review-rows.review.ts");
    expect(adapterComposer).toContain("@gafus/identity-write-server/reminder-review-rows");
    for (const impl of [storage, keyedSql]) {
      expect(impl).toContain('AND "registrationPending" = false FOR UPDATE');
      expect(impl).toContain("tx.reminder.count");
      expect(impl).toContain("tx.reminder.create");
    }
    expect(storage).toContain("MAX_REMINDERS=5");
  });
  it("B03 build boundary is external published package, not random relative TS source", () => {
    expect(apiBuild).toContain('"@gafus/core",');
    expect(apiBuild).toContain("noExternal: []");
    expect(pkg.scripts.build).toBe("tsc && ts-add-js-extension --dir dist");
  });
  it("B04 gate fails closed before dynamic package import and certifies compiled lock", () => {
    const sourceGuard = gate.indexOf("SOURCE_PATCH_NOT_APPLIED");
    const importPoint = gate.indexOf("await import(entry)");
    expect(sourceGuard).toBeGreaterThan(0);
    expect(importPoint).toBeGreaterThan(sourceGuard);
    expect(gate).toContain('storageJs.includes("FOR UPDATE")');
    expect(gate).toContain('keyedRowsJs.includes("FOR UPDATE")');
    expect(gate).toContain("training-reminder-storage.js");
    expect(gate).toContain("AG1_PACKAGE_GATE_API_BUNDLES_UNSAFE_DIRECT_SOURCE");
    expect(gate).toContain("AG1_PACKAGE_GATE_API_DIST_NOT_REBUILT");
  });
});
