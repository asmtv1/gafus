import type { ReminderAG4ReviewRowsPort } from "@gafus/core/services/reminders";
import * as rows from "@gafus/identity-write-server/reminder-review-rows";
const asTx = (opaque: unknown): rows.ReminderReviewTx => opaque as rows.ReminderReviewTx;
export const reminderRows: ReminderAG4ReviewRowsPort = {
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
