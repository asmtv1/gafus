import { beforeEach, describe, expect, it, vi } from "vitest";

const m=vi.hoisted(()=>({
  dashboard:vi.fn(), admin:vi.fn(), send:vi.fn(), set:vi.fn(),
  del:vi.fn(), warn:vi.fn(), error:vi.fn(),
}));
vi.mock("@gafus/core/services/systemHealth",()=>({
  getAdminMediaDashboard:m.dashboard,
  getMediaAlertAdminEmails:m.admin,
  MEDIA_MONITOR_HEARTBEAT_KEY:"gafus:media:monitor:v1:heartbeat",
}));
vi.mock("@gafus/mailer",()=>({sendTransactionalMail:m.send}));
vi.mock("@gafus/queues",()=>({
  connection:{set:m.set,del:m.del},
}));
vi.mock("@gafus/logger",()=>({
  createWorkerLogger:()=>({warn:m.warn,error:m.error}),
}));
import { monitorMediaProcessing } from "./media-processing-alerts";
const stopped = {
  attention: ["feed-video"],
  rows: [{
    kind:"feed-video",pending:12,stuck:2,oldestPendingMinutes:40,
    errors:{"499":5,timeout:1},
  }],
};
beforeEach(()=>{
  vi.clearAllMocks();
  vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED","true");
  m.dashboard.mockResolvedValue(stopped);
  m.admin.mockResolvedValue(["admin@example.com"]);
  m.set.mockResolvedValue("OK");
  m.del.mockResolvedValue(1);
  m.send.mockResolvedValue(undefined);
});
describe("Cloud.ru media admin notifications",()=>{
  it("does not read data or mail when Cloud.ru media is disabled",async()=>{
    vi.stubEnv("CLOUDRU_MEDIA_JOBS_ENABLED","false");
    expect(await monitorMediaProcessing()).toEqual({disabled:true,alerted:0});
    expect(m.dashboard).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });
  it("emails verified ADMIN recipients with technical counts, no upload IDs",async()=>{
    expect(await monitorMediaProcessing()).toEqual({alerted:1});
    expect(m.admin).toHaveBeenCalledOnce();
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({
      to:["admin@example.com"],category:"notice",deliveryMode:"deferred",
      subject:expect.stringContaining("feed-video"),
      text:expect.stringContaining("Зависшие: 2"),
    }));
    expect(m.set).toHaveBeenCalledWith(
      "gafus:media:alert:v1:feed-video","1","EX",3600,"NX",
    );
  });
  it("deduplicates persistent alerts and clears lock on recovery",async()=>{
    m.set.mockResolvedValue(null);
    expect(await monitorMediaProcessing()).toEqual({alerted:0});
    expect(m.send).not.toHaveBeenCalled();
    m.dashboard.mockResolvedValue({attention:[],rows:[]});
    expect(await monitorMediaProcessing()).toEqual({alerted:0});
    expect(m.del).toHaveBeenCalledWith("gafus:media:alert:v1:feed-video");
  });
  it("does not send when Core returns no validated ADMIN recipients",async()=>{
    m.admin.mockResolvedValue([]);
    expect(await monitorMediaProcessing()).toEqual({alerted:0});
    expect(m.send).not.toHaveBeenCalled();
  });
  it("releases cooldown if mail is rejected so a later alert can retry",async()=>{
    m.send.mockRejectedValue(Error("RESEND_FAILED"));
    expect(await monitorMediaProcessing()).toEqual({alerted:0});
    expect(m.del).toHaveBeenCalledWith("gafus:media:alert:v1:feed-video");
    expect(m.error).toHaveBeenCalled();
  });
});
