import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const sql=vi.hoisted(()=>({
  tx:vi.fn(async (fn:(tx:unknown)=>Promise<unknown>)=>fn({id:"local-tx"})),
  create:vi.fn(async()=>({id:"reminder-1"})),
}));
vi.mock("@gafus/identity-write-server/reminder-review-rows",()=>({
  withAG4ReminderCreateTx:sql.tx,
  lockAG4ReminderOwner:vi.fn(async()=>[{id:"owner-1"}]),
  readAG4ReminderReceipt:vi.fn(async()=>[]),
  checkOwnerTrainingReminder:vi.fn(async()=>null),
  beginAG4ReminderReceipt:vi.fn(async()=>1),
  countAG4TrainingReminders:vi.fn(async()=>0),
  createAG4Reminder:sql.create,
  commitAG4ReminderReceipt:vi.fn(async()=>1),
  readAG4ReminderReceiptForLookup:vi.fn(async()=>[]),
  isReminderUniqueConstraintError:vi.fn(()=>false),
}));
describe("AG4 reminder source-review-only API SQL composer",()=>{
 it("does not mount AG4 review routes, and composes single owner TX if invoked directly",async()=>{
  const app=readFileSync(fileURLToPath(new URL("../../../app.ts",import.meta.url)),"utf8");
  expect(app).not.toContain("install-ag4-review-rows.review");
  expect(app).not.toContain("g1-reminders-v2-unmounted.review");
  const route=readFileSync(fileURLToPath(new URL("../../../routes/v1/reminders.ts",import.meta.url)),"utf8");
  expect(route).toContain('import { reminderRows } from "../../modules/reminders/composition/reminder-rows.js";');
  const { reminderRows } = await import("./reminder-rows");
  const core=await import("@gafus/core/services/reminders");
  await expect(core.createReminderAG4("owner-1",{
    name:"Dog walk",reminderTime:"09:00",reminderDays:"1,3",timezone:"Europe/Moscow",
  },"00000000-0000-4000-8000-000000000001", reminderRows)).resolves.toMatchObject({kind:"created"});
  expect(sql.tx).toHaveBeenCalledTimes(1);
  expect(sql.create).toHaveBeenCalledTimes(1);
 });
});
