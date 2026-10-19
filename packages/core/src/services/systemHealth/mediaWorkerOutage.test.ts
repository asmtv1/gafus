import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({
  get:vi.fn(),del:vi.fn(),set:vi.fn(),
  admins:vi.fn(),send:vi.fn(),
}));
vi.mock("@gafus/prisma",()=>({
  prisma:{user:{findMany:m.admins}},
}));
vi.mock("@gafus/queues",()=>({
  connection:{get:m.get,del:m.del,set:m.set},
}));
vi.mock("@gafus/mailer",()=>({sendTransactionalMail:m.send}));
vi.mock("./mediaMonitoring",()=>({
  MEDIA_MONITOR_HEARTBEAT_KEY:"gafus:media:monitor:v1:heartbeat",
}));
import { getMediaAlertAdminEmails, notifyStoppedMediaWorker } from "./mediaWorkerOutage";

const now=new Date("2026-10-19T16:00:00Z");
beforeEach(()=>{
  vi.clearAllMocks();
  m.get.mockResolvedValue(String(now.getTime()-13*60_000));
  m.set.mockResolvedValue("OK");
  m.del.mockResolvedValue(1);
  m.admins.mockResolvedValue([{email:"admin@example.com"}]);
  m.send.mockResolvedValue(undefined);
});
describe("independent API watcher when entire Worker process is down",()=>{
  it("does nothing when media Jobs disabled",async()=>{
    expect(await notifyStoppedMediaWorker(now,false)).toEqual({
      disabled:true,alerted:false,
    });
    expect(m.get).not.toHaveBeenCalled();
  });
  it("clears prior alert if new heartbeat is fresh",async()=>{
    m.get.mockResolvedValue(String(now.getTime()-2000));
    expect(await notifyStoppedMediaWorker(now,true)).toEqual({
      stopped:false,alerted:false,
    });
    expect(m.del).toHaveBeenCalledWith("gafus:media:alert:v1:worker-unavailable");
    expect(m.send).not.toHaveBeenCalled();
  });
  it("emails only ADMINs after missing 12-minute heartbeat and uses Redis dedup",async()=>{
    expect(await notifyStoppedMediaWorker(now,true)).toEqual({
      stopped:true,alerted:true,
    });
    expect(m.admins).toHaveBeenCalledWith({
      where:{role:"ADMIN"},select:{email:true},take:20,
    });
    expect(m.set).toHaveBeenCalledWith(
      "gafus:media:alert:v1:worker-unavailable","1","EX",3600,"NX",
    );
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({
      to:["admin@example.com"],category:"notice",deliveryMode:"immediate",
      subject:expect.stringContaining("остановился"),
      text:expect.stringContaining("gafus-worker"),
    }));
    m.set.mockResolvedValueOnce(null);
    expect(await notifyStoppedMediaWorker(now,true)).toEqual({
      stopped:true,alerted:false,
    });
    expect(m.send).toHaveBeenCalledTimes(1);
  });
  it("does not invent a healthy Worker if its heartbeat is absent",async()=>{
    m.get.mockResolvedValue(null);
    expect((await notifyStoppedMediaWorker(now,true)).stopped).toBe(true);
  });
  it("does not alert if Redis itself fails; failed emails release dedup",async()=>{
    m.get.mockRejectedValueOnce(Error("redis down"));
    await expect(notifyStoppedMediaWorker(now,true)).rejects.toThrow("redis down");
    expect(m.send).not.toHaveBeenCalled();
    m.send.mockRejectedValueOnce(Error("mail down"));
    expect(await notifyStoppedMediaWorker(now,true)).toEqual({
      stopped:true,alerted:false,
    });
    expect(m.del).toHaveBeenCalledWith("gafus:media:alert:v1:worker-unavailable");
  });
});

describe("shared Core-only admin recipient lookup", () => {
  it("selects only ADMINs and excludes malformed and duplicate emails", async () => {
    m.admins.mockResolvedValue([{email:"admin@example.com"},{email:"bad"},
      {email:null},{email:"admin@example.com"}]);
    expect(await getMediaAlertAdminEmails()).toEqual(["admin@example.com"]);
    expect(m.admins).toHaveBeenCalledWith({where:{role:"ADMIN"},
      select:{email:true},take:20});
  });
});
