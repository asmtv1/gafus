import { beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(()=>vi.resetModules());
const key="00000000-0000-4000-8000-000000000001";
const draft={name:"Dog walk",reminderTime:"09:00",reminderDays:"1,3",timezone:"Europe/Moscow"};
function adapter(){
 return {
  withAG4ReminderCreateTx:vi.fn(async <T>(fn:(tx:unknown)=>Promise<T>)=>fn({sameTx:true})),
  lockAG4ReminderOwner:vi.fn(async()=>[{id:"owner"}]),
  readAG4ReminderReceipt:vi.fn(async()=>[]),
  checkOwnerTrainingReminder:vi.fn(async()=>null),
  beginAG4ReminderReceipt:vi.fn(async()=>1),
  countAG4TrainingReminders:vi.fn(async()=>0),
  createAG4Reminder:vi.fn(async()=>({id:"reminder-1"})),
  commitAG4ReminderReceipt:vi.fn(async()=>1),
  readAG4ReminderReceiptForLookup:vi.fn(async()=>[]),
  isReminderUniqueConstraintError:vi.fn(()=>false),
 };
}
describe("source-review AG4 reminder port is never silently activated",()=>{
 it("requires explicit SQL binding for valid new idempotent reminder",async()=>{
  const svc=await import("./g1ReminderMutationReceiptAG4.review");
  await expect(svc.createReminderAG4("owner-1",draft,key))
    .rejects.toThrow("REMINDER_AG4_REVIEW_PORT_UNBOUND");
  await expect(svc.lookupReminderAG4("owner-1",key))
    .rejects.toThrow("REMINDER_AG4_REVIEW_PORT_UNBOUND");
 });
 it("keeps owner lock before receipt and receipt after same Tx reminder creation",async()=>{
  const svc=await import("./g1ReminderMutationReceiptAG4.review");
  const p=await import("./reminderAG4ReviewPort");const db=adapter();p.registerReminderAG4ReviewRowsPort(db);
  await expect(svc.createReminderAG4("owner-1",draft,key))
    .resolves.toMatchObject({kind:"created",reminder:{id:"reminder-1"}});
  expect(db.withAG4ReminderCreateTx).toHaveBeenCalledTimes(1);
  expect(db.lockAG4ReminderOwner.mock.invocationCallOrder[0]).toBeLessThan(
    db.readAG4ReminderReceipt.mock.invocationCallOrder[0]);
  expect(db.createAG4Reminder.mock.calls[0]?.[0]).toBe(db.commitAG4ReminderReceipt.mock.calls[0]?.[0]);
  expect(db.commitAG4ReminderReceipt).toHaveBeenCalledWith(
    expect.anything(),"owner-1",key,"reminder-1",expect.anything());
 });
 it("does not allow hot swapping review-only SQL adapter",async()=>{
  const p=await import("./reminderAG4ReviewPort");const db=adapter();p.registerReminderAG4ReviewRowsPort(db);
  p.registerReminderAG4ReviewRowsPort(db);
  expect(()=>p.registerReminderAG4ReviewRowsPort(adapter()))
    .toThrow("REMINDER_AG4_REVIEW_PORT_ALREADY_BOUND");
 });
});
