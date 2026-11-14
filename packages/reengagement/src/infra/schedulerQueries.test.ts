import {beforeEach,describe,expect,it,vi} from "vitest";
const findFirst=vi.hoisted(()=>vi.fn());
vi.mock("@gafus/prisma",()=>({prisma:{reengagementCampaign:{findFirst}}}));
import {
 isReengagementNotificationDue,getActiveReengagementCampaignForScheduling,
} from "./schedulerQueries.js";
describe("owner-only reengagement scheduling projection",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("only selects active campaign of specified user; ignores future due date",async()=>{
   const now=new Date("2026-11-07T06:00:00Z");
   findFirst.mockResolvedValueOnce({nextNotificationDate:new Date("2026-11-08T06:00:00Z")});
   expect(await isReengagementNotificationDue("actor-1",now)).toBe(false);
   expect(findFirst).toHaveBeenCalledExactlyOnceWith({
     where:{userId:"actor-1",isActive:true},
     select:{nextNotificationDate:true},
   });
 });
 it("due for current timestamp but not for missing campaign",async()=>{
   const now=new Date("2026-11-07T06:00:00Z");
   findFirst.mockResolvedValueOnce({nextNotificationDate:now}).mockResolvedValueOnce(null);
   expect(await isReengagementNotificationDue("actor-1",now)).toBe(true);
   expect(await isReengagementNotificationDue("actor-1",now)).toBe(false);
 });
 it("fetches only campaign ID and scheduling level for the same actor",async()=>{
   findFirst.mockResolvedValueOnce({id:"camp-1",currentLevel:3});
   expect(await getActiveReengagementCampaignForScheduling("actor-1")).toEqual({id:"camp-1",currentLevel:3});
   expect(findFirst).toHaveBeenCalledExactlyOnceWith({
      where:{userId:"actor-1",isActive:true},select:{id:true,currentLevel:true},
   });
 });
});
