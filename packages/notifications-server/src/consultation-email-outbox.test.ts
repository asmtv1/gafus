import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  findMany: vi.fn(), updateMany: vi.fn(), add: vi.fn(),
  findBooking: vi.fn(), createMany: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: { consultationEmailLog: { findMany: m.findMany, updateMany: m.updateMany } },
  ConsultationEmailStatus: { PENDING: "PENDING", SENT: "SENT", FAILED: "FAILED" },
  Prisma: { PrismaClientKnownRequestError: Error },
}));
vi.mock("@gafus/queues", () => ({
  CONSULTATION_MAIL_JOB_ID: (id:string) => "consultation-mail-" + id,
  consultationMailQueue: { add: m.add },
}));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));
import { recoverUnstartedConsultationEmails, stageConsultationEmailIntents } from "./consultation-email-outbox";
const now = new Date("2026-11-27T10:00:00Z");
const old = new Date(now.getTime() - 120_000);
const tx = {
  consultationBooking: { findUnique: m.findBooking },
  consultationEmailLog: { createMany: m.createMany },
} as unknown as Parameters<typeof stageConsultationEmailIntents>[0];
beforeEach(() => {
  vi.resetAllMocks();
  m.findMany.mockResolvedValue([{id:"log-A",updatedAt:old}]);
  m.updateMany.mockResolvedValue({count:1});
  m.findBooking.mockResolvedValue({client:{email:"client@example.test"},cynologist:{user:{email:"trainer@example.test"}}});
});
describe("consultation transactional email intents", () => {
  it("stages both distinct recipient events through the caller transaction, not Redis", async () => {
    await stageConsultationEmailIntents(tx,"booking",["CLIENT_BOOKING_RECEIVED","TRAINER_CONFIRM_REQUEST","CLIENT_BOOKING_RECEIVED"]);
    expect(m.createMany).toHaveBeenCalledExactlyOnceWith({
      data:[
        {bookingId:"booking",type:"CLIENT_BOOKING_RECEIVED",status:"PENDING",attempts:0},
        {bookingId:"booking",type:"TRAINER_CONFIRM_REQUEST",status:"PENDING",attempts:0},
      ],skipDuplicates:true,
    });
    expect(m.add).not.toHaveBeenCalled();
  });
  it("preserves no-recipient behavior without suppressing the other participant", async () => {
    m.findBooking.mockResolvedValueOnce({client:{email:null},cynologist:{user:{email:"trainer@example.test"}}});
    await stageConsultationEmailIntents(tx,"booking",["CLIENT_BOOKING_RECEIVED","TRAINER_CONFIRM_REQUEST"]);
    expect(m.createMany).toHaveBeenCalledWith({data:[{bookingId:"booking",type:"TRAINER_CONFIRM_REQUEST",status:"PENDING",attempts:0}],skipDuplicates:true});
  });
  it("propagates staging failure so the owner transaction cannot commit without the intent",async()=>{
    m.createMany.mockRejectedValueOnce(new Error("SQL_ABORT"));
    await expect(stageConsultationEmailIntents(tx,"booking",["CLIENT_BOOKING_RECEIVED"])).rejects.toThrow("SQL_ABORT");
    expect(m.add).not.toHaveBeenCalled();
  });
});
describe("recover unstarted consultation emails", () => {
  it("re-adds only aged PENDING zero-attempt rows with the same stable job ID", async () => {
    expect(await recoverUnstartedConsultationEmails({now})).toEqual({checked:1,queued:1,failed:0});
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{status:"PENDING",attempts:0,updatedAt:{lte:new Date(now.getTime()-60_000)}},
      orderBy:[{updatedAt:"asc"},{id:"asc"}],take:50,
    }));
    expect(m.updateMany).toHaveBeenCalledWith({where:{id:"log-A",status:"PENDING",attempts:0,updatedAt:old},data:{updatedAt:now}});
    expect(m.add).toHaveBeenCalledWith("send",{emailLogId:"log-A"},expect.objectContaining({jobId:"consultation-mail-log-A"}));
  });
  it("skips a row whose status, attempt or claim changed after selection",async()=>{
    m.updateMany.mockResolvedValueOnce({count:0});
    expect(await recoverUnstartedConsultationEmails({now})).toEqual({checked:1,queued:0,failed:0});
    expect(m.add).not.toHaveBeenCalled();
  });
  it("isolates queue failures and attempts other rows; does not mark an email sent or failed",async()=>{
    m.findMany.mockResolvedValueOnce([{id:"log-A",updatedAt:old},{id:"log-B",updatedAt:old}]);
    m.add.mockRejectedValueOnce(new Error("REDIS_UNAVAILABLE")).mockResolvedValueOnce({});
    expect(await recoverUnstartedConsultationEmails({now})).toEqual({checked:2,queued:1,failed:1});
    expect(m.updateMany.mock.calls.map(([a])=>a.data)).toEqual([{updatedAt:now},{updatedAt:now}]);
  });
});
