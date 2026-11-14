import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({findMany:vi.fn(),getJob:vi.fn(),add:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{stepNotification:{findMany:m.findMany}}}));
vi.mock("@gafus/queues",()=>({pushQueue:{getJob:m.getJob,add:m.add}}));
import { reconcileQuestionNotifications } from "./notifications.js";
describe("question notification maintenance never scans unrelated pushes",()=>{
 beforeEach(()=>{vi.resetAllMocks();m.findMany.mockResolvedValue([]);});
 it("uses strict question-only unsent, unpaused, seven-day bounded projection",async()=>{
  await reconcileQuestionNotifications();
  expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where: expect.objectContaining({
    id:{startsWith:"question-"},sent:false,paused:false,
    user:{pushSubscriptions:{some:{}}},
    createdAt:{gte:expect.any(Date)},
   }),
   orderBy:{createdAt:"asc"},take:100,
  }));
  expect(m.add).not.toHaveBeenCalled();
 });
 it("never duplicates an active job, but re-arms failed jobs with the SAME id",async()=>{
  m.findMany.mockResolvedValue([{id:"question-notice-1"},{id:"question-notice-2"}]);
  const remove=vi.fn().mockResolvedValue(undefined);
  m.getJob.mockResolvedValueOnce({getState:async()=> "active",remove})
    .mockResolvedValueOnce({getState:async()=> "failed",remove});
  m.add.mockResolvedValue({id:"question-notice-2"});
  await reconcileQuestionNotifications();
  expect(m.add).toHaveBeenCalledExactlyOnceWith("push",{notificationId:"question-notice-2"},
   expect.objectContaining({jobId:"question-notice-2",attempts:3}));
  expect(remove).toHaveBeenCalledOnce();
 });
});
