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
const contract = JSON.parse(read("apps/api/g1-reminder-idempotency-review-v1/AG1_REMINDER_P0_PACKAGED_ENTRYPOINT_CREATE_AND_LOOKUP_CONTRACT.v2.json"));
const required = contract.afterReviewSHA256;
for (const [file, expected] of Object.entries(required)) {
  if (sha(file) !== expected) {
    process.stderr.write("AG1_PACKAGE_GATE_SOURCE_PATCH_NOT_APPLIED " + file + "\n");
    process.exit(78);
  }
}
const packageEntry = "packages/core/dist/core/src/services/reminders/index.js";
const legacy = "packages/core/dist/core/src/services/reminders/reminderService.js";
const receipt = "packages/core/dist/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.js";
const packageJson = JSON.parse(read("packages/core/package.json"));
if (packageJson.exports["./services/reminders"]?.default !== "./dist/core/src/services/reminders/index.js") {
  process.stderr.write("AG1_PACKAGE_GATE_CORE_EXPORT_CHANGED\n");
  process.exit(78);
}
for (const file of [packageEntry, legacy, receipt]) {
  if (!existsSync(path(file))) {
    process.stderr.write("AG1_PACKAGE_GATE_MISSING_COMPILED_FILE " + file + "\n");
    process.exit(78);
  }
}
const entryJs = read(packageEntry);
const legacyJs = read(legacy);
const receiptJs = read(receipt);
if (!entryJs.includes("g1ReminderMutationReceiptAG4.review.js") ||
    !entryJs.includes("reminderService.js") ||
    !legacyJs.includes("FOR UPDATE") ||
    !legacyJs.includes("$transaction(") ||
    !receiptJs.includes("FOR UPDATE") ||
    !receiptJs.includes("$transaction(")) {
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
for (const name of ["createReminder", "createReminderAG4", "lookupReminderAG4",
  "ReminderCapError", "ReminderConflictError", "ReminderUnknownError"]) {
  if (typeof compiled[name] !== "function") {
    process.stderr.write("AG1_PACKAGE_GATE_MISSING_CORE_EXPORT " + name + "\n");
    process.exit(78);
  }
}
const apiDist = "apps/api/dist/index.js";
if (!existsSync(path(apiDist))) {
  process.stderr.write("AG1_PACKAGE_GATE_API_DIST_NOT_REBUILT\n");
  process.exit(78);
}
const compiledApi = read(apiDist);
if (compiledApi.includes("packages/core/src/services/reminders/reminderService.js") ||
    compiledApi.includes("packages/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.js")) {
  process.stderr.write("AG1_PACKAGE_GATE_API_BUNDLES_UNSAFE_DIRECT_SOURCE\n");
  process.exit(78);
}
const out = {
  state: "PASS_PACKAGED_RUNTIME_NO_SQL",
  sourceRouteSHA: sha("apps/api/src/routes/v1/reminders.ts"),
  packageIndexSHA: sha(packageEntry), legacySHA: sha(legacy), receiptSHA: sha(receipt),
  apiDistSHA: sha(apiDist),
  realSql: "NOT_RUN", wroteFiles: false,
};
process.stdout.write(JSON.stringify(out) + "\n");
