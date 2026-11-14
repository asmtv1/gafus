import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({findCourse:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{course:{findFirst:m.findCourse}}}));
import {readOfflineCourseVersion,readOfflineFullCourse} from "./offlineRead.js";

beforeEach(()=>{vi.clearAllMocks()});
describe("offline course read-only persistence",()=>{
 it("looks up only the requested exact course type, the oldest matching row, and its version",async()=>{
   const updatedAt=new Date("2026-11-10T04:00:00Z");
   m.findCourse.mockResolvedValueOnce({updatedAt});
   expect(await readOfflineCourseVersion("trainer-public")).toEqual({updatedAt});
   expect(m.findCourse).toHaveBeenCalledExactlyOnceWith({
     where:{type:"trainer-public"},select:{updatedAt:true},orderBy:{createdAt:"asc"},
   });
 });
 it("preserves the canonical nested ordered day/step occurrence snapshot",async()=>{
   m.findCourse.mockResolvedValueOnce(null);
   expect(await readOfflineFullCourse("trainer-public")).toBeNull();
   const query=m.findCourse.mock.calls[0]?.[0];
   expect(query.where).toEqual({type:"trainer-public"});
   expect(query.orderBy).toEqual({createdAt:"asc"});
   expect(query.select.dayLinks.orderBy).toEqual({order:"asc"});
   expect(query.select.dayLinks.select.day.select.stepLinks.orderBy).toEqual({order:"asc"});
   expect(query.select.dayLinks.select.day.select.stepLinks.select.step.select).toMatchObject({
     videoUrls:true,imageUrls:true,pdfUrls:true,checklist:true,
     requiresVideoReport:true,requiresWrittenFeedback:true,hasTestQuestions:true,
   });
 });
 it("propagates database failures to the Core application error adapter",async()=>{
   m.findCourse.mockRejectedValueOnce(new Error("SYNTHETIC_OFFLINE_DB_FAULT"));
   await expect(readOfflineFullCourse("any")).rejects.toThrow("SYNTHETIC_OFFLINE_DB_FAULT");
 });
});
