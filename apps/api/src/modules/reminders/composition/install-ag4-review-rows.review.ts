/** AG4 reminder SQL composer. The keyed POST is already part of the existing
 * production reminders route: this only installs its Core-to-SQL port and
 * does NOT activate any additional unmounted review candidate route.
 * All PostgreSQL receipt, owner lock and reminder creation remain atomic.
 */
import * as reminderCore from "@gafus/core/services/reminders";
import * as rows from "@gafus/identity-write-server/reminder-review-rows";
const asTx = (opaque: unknown): rows.ReminderReviewTx => opaque as rows.ReminderReviewTx;
const reminderRows = {
  withAG4ReminderCreateTx: <T>(fn: (tx: unknown) => Promise<T>) => rows.withAG4ReminderCreateTx(tx => fn(tx)),
  lockAG4ReminderOwner: (tx: unknown, owner: string) => rows.lockAG4ReminderOwner(asTx(tx), owner),
  readAG4ReminderReceipt: (tx: unknown, owner: string, key: string) => rows.readAG4ReminderReceipt(asTx(tx), owner, key),
  checkOwnerTrainingReminder: (owner: string, id: string, tx?: unknown) => rows.checkOwnerTrainingReminder(owner, id, tx === undefined ? undefined : asTx(tx)),
  beginAG4ReminderReceipt: (tx: unknown, owner: string, key: string, fp: string, expires: Date) => rows.beginAG4ReminderReceipt(asTx(tx), owner, key, fp, expires),
  countAG4TrainingReminders: (tx: unknown, owner: string) => rows.countAG4TrainingReminders(asTx(tx), owner),
  createAG4Reminder: (tx: unknown, owner: string, draft: rows.ReminderDraftRow) => rows.createAG4Reminder(asTx(tx), owner, draft),
  commitAG4ReminderReceipt: (tx: unknown, owner: string, key: string, reminder: string, response: unknown) => rows.commitAG4ReminderReceipt(asTx(tx), owner, key, reminder, response),
  readAG4ReminderReceiptForLookup: rows.readAG4ReminderReceiptForLookup,
  isReminderUniqueConstraintError: rows.isReminderUniqueConstraintError,
};
// This is an existing keyed POST route, not a new AG4 route activation.
// Mocks of the legacy keyless-only HTTP route may omit the new exported port;
// actual compiled Core has it and must bind before the first Hono request.
if (Object.prototype.hasOwnProperty.call(reminderCore, "registerReminderAG4ReviewRowsPort")) {
  reminderCore.registerReminderAG4ReviewRowsPort(reminderRows);
}
