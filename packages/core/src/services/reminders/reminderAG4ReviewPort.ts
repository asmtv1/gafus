/** SOURCE REVIEW ONLY — does NOT authorize reminder schema migration or route
 * activation. Server keeps one PostgreSQL transaction: owner lock, receipt,
 * limit and reminder insert, committed response. No Core Prisma import.
 */
export type ReminderAG4Tx = unknown;
export type ReminderAG4Receipt = {
  operationKind: string;
  fingerprint: string;
  state: string;
  responseJson: unknown;
  reminderId: string | null;
  expiresAt: Date;
};
export type ReminderAG4Draft = {
  name: string; reminderTime: string; reminderDays: string | null; timezone: string;
};
export interface ReminderAG4ReviewRowsPort {
  withAG4ReminderCreateTx<T>(fn: (tx: ReminderAG4Tx) => Promise<T>): Promise<T>;
  lockAG4ReminderOwner(tx: ReminderAG4Tx, ownerId: string): Promise<{id:string}[]>;
  readAG4ReminderReceipt(tx: ReminderAG4Tx, ownerId: string, key: string): Promise<ReminderAG4Receipt[]>;
  checkOwnerTrainingReminder(ownerId: string, reminderId: string, tx?: ReminderAG4Tx): Promise<{id:string} | null>;
  beginAG4ReminderReceipt(tx: ReminderAG4Tx, ownerId: string, key: string, fingerprint: string, expiresAt: Date): Promise<number>;
  countAG4TrainingReminders(tx: ReminderAG4Tx, ownerId: string): Promise<number>;
  createAG4Reminder(tx: ReminderAG4Tx, ownerId: string, draft: ReminderAG4Draft): Promise<{id:string}>;
  commitAG4ReminderReceipt(tx: ReminderAG4Tx, ownerId: string, key: string, reminderId: string, response: unknown): Promise<number>;
  readAG4ReminderReceiptForLookup(ownerId: string, key: string): Promise<ReminderAG4Receipt[]>;
  isReminderUniqueConstraintError(error: unknown): boolean;
}
let installed: Readonly<ReminderAG4ReviewRowsPort> | null = null;
export function registerReminderAG4ReviewRowsPort(port: ReminderAG4ReviewRowsPort): void {
  if (installed !== null && installed !== port) throw new Error("REMINDER_AG4_REVIEW_PORT_ALREADY_BOUND");
  installed = port;
}
export function requireReminderAG4ReviewRowsPort(): Readonly<ReminderAG4ReviewRowsPort> {
  if (!installed) throw new Error("REMINDER_AG4_REVIEW_PORT_UNBOUND");
  return installed;
}
