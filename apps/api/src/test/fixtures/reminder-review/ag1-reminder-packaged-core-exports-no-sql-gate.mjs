/** AG1 P0: READ-ONLY Node runtime package export/compiled Core gate.
 * Not a real PG test. No prisma generate/migrate, no SQL, no writes, no external providers.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = "/Users/asmtv1/Desktop/gafus-refactor";
if (process.cwd() !== root) {
  process.stderr.write("AG1_PACKAGE_GATE_WRONG_ROOT_NO_IMPORT\n");
  process.exit(78);
}
const path = (r) => resolve(root, r);
const read = (r) => readFileSync(path(r), "utf8");
const sha = (r) => createHash("sha256").update(readFileSync(path(r))).digest("hex");
// Archived AG1 SHA fixture is provenance of the original source review; it
// predates extracting legacy keyless SQL to notifications-server. Never falsely
// demand that 2026-10 source SHA still match current implementation. The live
// source/export assertions below replace that obsolete fingerprint for this gate.
const requiredSource = [
  "apps/api/src/routes/v1/reminders.ts",
  "packages/core/src/services/reminders/index.ts",
  "packages/notifications-server/src/training-reminder-application.ts",
  "packages/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.ts",
  "packages/notifications-server/src/training-reminder-storage.ts",
  "packages/identity-write-server/src/reminderReviewRows.ts",
];
for (const file of requiredSource) {
  if (!existsSync(path(file))) {
    process.stderr.write("AG1_PACKAGE_GATE_SOURCE_PATCH_NOT_APPLIED " + file + "\n");
    process.exit(78);
  }
}
const legacyApplicationSource = read("packages/notifications-server/src/training-reminder-application.ts");
const ownerStorageSource = read("packages/notifications-server/src/training-reminder-storage.ts");
const keyedSource = read("packages/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.ts");
const keyedRowsSource = read("packages/identity-write-server/src/reminderReviewRows.ts");
const indexSource = read("packages/core/src/services/reminders/index.ts");
const routeSource = read("apps/api/src/routes/v1/reminders.ts");
if (!legacyApplicationSource.includes('./training-reminder-storage.js') ||
    !legacyApplicationSource.includes('createTrainingReminderRow(') ||
    legacyApplicationSource.includes('from "@gafus/prisma"') ||
    !indexSource.includes('g1ReminderMutationReceiptAG4.review') ||
    !routeSource.includes('@gafus/core/services/reminders') ||
    !routeSource.includes('@gafus/notifications-server/training-reminder-application') ||
    !keyedSource.includes('@gafus/identity-write-server/reminder-review-rows') ||
    !ownerStorageSource.includes('AND "registrationPending" = false FOR UPDATE') ||
    !keyedRowsSource.includes('AND "registrationPending" = false FOR UPDATE') ||
    !ownerStorageSource.includes('tx.reminder.count') ||
    !keyedRowsSource.includes('tx.reminder.count') ||
    !ownerStorageSource.includes('tx.reminder.create') ||
    !keyedRowsSource.includes('tx.reminder.create')) {
  process.stderr.write("AG1_PACKAGE_GATE_SOURCE_PATCH_NOT_APPLIED current owner-lock contract\n");
  process.exit(78);
}
const packageEntry = "packages/core/dist/core/src/services/reminders/index.js";
const legacy = "packages/notifications-server/dist/training-reminder-application.js";
const receipt = "packages/core/dist/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.js";
const storage = "packages/notifications-server/dist/training-reminder-storage.js";
const keyedRows = "packages/identity-write-server/dist/reminderReviewRows.js";
const packageJson = JSON.parse(read("packages/core/package.json"));
if (packageJson.exports["./services/reminders"]?.default !== "./dist/core/src/services/reminders/index.js") {
  process.stderr.write("AG1_PACKAGE_GATE_CORE_EXPORT_CHANGED\n");
  process.exit(78);
}
for (const file of [packageEntry, legacy, receipt, storage, keyedRows]) {
  if (!existsSync(path(file))) {
    process.stderr.write("AG1_PACKAGE_GATE_MISSING_COMPILED_FILE " + file + "\n");
    process.exit(78);
  }
}
const entryJs = read(packageEntry);
const legacyJs = read(legacy);
const receiptJs = read(receipt);
const storageJs = read(storage);
const keyedRowsJs = read(keyedRows);
if (!entryJs.includes("g1ReminderMutationReceiptAG4.review.js") ||
    !legacyJs.includes('./training-reminder-storage.js') ||
    !storageJs.includes("FOR UPDATE") ||
    !storageJs.includes("$transaction(") ||
    !storageJs.includes('tx.reminder.count') ||
    !storageJs.includes('tx.reminder.create') ||
    !keyedRowsJs.includes("FOR UPDATE") ||
    !receiptJs.includes("@gafus/identity-write-server/reminder-review-rows") ||
    !keyedRowsJs.includes("$transaction(")) {
  process.stderr.write("AG1_PACKAGE_GATE_CORE_DIST_NOT_REBUILT_OR_NOT_LOCKED\n");
  process.exit(78);
}
const entry = import.meta.resolve("@gafus/core/services/reminders");
const actual = fileURLToPath(entry);
if (relative(path(packageEntry), actual) !== "") {
  process.stderr.write("AG1_PACKAGE_GATE_WRONG_NODE_RESOLUTION\n");
  process.exit(78);
}
// Dynamic import is SAFE only after verifying all compiled module source/exports.
const compiled = await import(entry);
for (const name of ["createReminderAG4", "lookupReminderAG4",
  "ReminderCapError", "ReminderConflictError", "ReminderUnknownError"]) {
  if (typeof compiled[name] !== "function") {
    process.stderr.write("AG1_PACKAGE_GATE_MISSING_CORE_EXPORT " + name + "\n");
    process.exit(78);
  }
}
const legacyEntry = import.meta.resolve("@gafus/notifications-server/training-reminder-application");
if (relative(path(legacy), fileURLToPath(legacyEntry)) !== "") {
  process.stderr.write("AG1_PACKAGE_GATE_WRONG_NOTIFICATIONS_NODE_RESOLUTION\n");
  process.exit(78);
}
const legacyCompiled = await import(legacyEntry);
for (const name of ["getReminders", "createReminder", "updateReminder", "deleteReminder"]) {
  if (typeof legacyCompiled[name] !== "function") {
    process.stderr.write("AG1_PACKAGE_GATE_MISSING_NOTIFICATIONS_EXPORT " + name + "\n");
    process.exit(78);
  }
}
const apiDist = "apps/api/dist/index.js";
if (!existsSync(path(apiDist))) {
  process.stderr.write("AG1_PACKAGE_GATE_API_DIST_NOT_REBUILT\n");
  process.exit(78);
}
const compiledApi = read(apiDist);
if (compiledApi.includes("packages/notifications-server/src/training-reminder-application.js") ||
    compiledApi.includes("packages/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.js")) {
  process.stderr.write("AG1_PACKAGE_GATE_API_BUNDLES_UNSAFE_DIRECT_SOURCE\n");
  process.exit(78);
}
const out = {
  state: "PASS_PACKAGED_RUNTIME_NO_SQL",
  sourceRouteSHA: sha("apps/api/src/routes/v1/reminders.ts"),
  packageIndexSHA: sha(packageEntry), legacySHA: sha(legacy), storageSHA: sha(storage), receiptSHA: sha(receipt), keyedRowsSHA: sha(keyedRows),
  apiDistSHA: sha(apiDist),
  realSql: "NOT_RUN", wroteFiles: false,
};
process.stdout.write(JSON.stringify(out) + "\n");
