/**
 * AG1 review-only, not mounted in the production API.
 * Registration, receipt replay, owner locking and write atomics are reviewed
 * against a disposable PostgreSQL schema before any route activation.
 */
import { createReminderCreateReviewUseCase } from
  "../../../../../../packages/core/src/services/reminders/g1ReminderCreateIdempotency.review.js";
import {
  withAG1ReminderCreateTx, readAG1ReminderReceipt, countAG1Reminders,
  createAG1Reminder, storeAG1ReminderReceipt, lookupAG1ReminderReceipt,
} from "@gafus/identity-write-server/reminder-review-rows";

export const {
  createReminderWithReceipt,
  lookupOwnReminderCreateReceipt,
} = createReminderCreateReviewUseCase({
  withOwnerTransaction: withAG1ReminderCreateTx,
  readReceipt: readAG1ReminderReceipt,
  countOwnerReminders: countAG1Reminders,
  createOwnerReminder: createAG1Reminder,
  storeReceipt: storeAG1ReminderReceipt,
  lookupReceipt: lookupAG1ReminderReceipt,
});
