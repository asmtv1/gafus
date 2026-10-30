import {describe,it,expect} from "vitest";
import {projectVetVisits,legacyVetVisitsGetPath,LEGACY_VET_VISITS_GET}
 from "./vetVisitsSourceMock";
const visit=(id="v1",petId="pet-A")=>({
 id,petId,visitedOn:"2026-10-10",specialty:"Терапевт",
 doctorName:"Врач",clinic:"Клиника",
 diagnosis:"PRIVATE_DIAGNOSIS",conclusion:"PRIVATE_CONCLUSION",
 notes:"PRIVATE_NOTES",attachments:[{
  id:"att1",name:"sensitive.pdf",mimeType:"application/pdf",sizeBytes:5000,
  hasPreview:false,previewProcessing:false,
  signedUrl:"SECRET_SIGNED_S3",userId:"SECRET_AUTHOR",
 }],ownerId:"SECRET_OWNER",socialSecurity:"PRIVATE_OTHER",
});
describe("WEB-URL-029 legacy Next owner-only medical read DTO",()=>{
 it("S01 existing exact Next GET contract; not an AG1 Hono API",()=>{
  expect(LEGACY_VET_VISITS_GET).toBe("/api/v1/pets/:petId/vet-visits");
  expect(legacyVetVisitsGetPath("pet-A")).toBe("/api/v1/pets/pet-A/vet-visits");
  expect(()=>legacyVetVisitsGetPath("../private")).toThrow();
 });
 it("S02 100% whitelisted visit fields, no signed URLs/owner IDs",()=>{
  const result=projectVetVisits([visit()],"pet-A");
  expect(result).toHaveLength(1);
  expect(result[0].diagnosis).toBe("PRIVATE_DIAGNOSIS");
  expect(JSON.stringify(result)).not.toMatch(/SECRET_|signedUrl|ownerId|socialSecurity/);
 });
 it("S03 chronological sort newest visit first",()=>{
  const x=projectVetVisits([{...visit("a"),visitedOn:"2025-10-10",attachments:[]},
   {...visit("b"),visitedOn:"2026-10-10",attachments:[] }],"pet-A");
  expect(x.map(v=>v.id)).toEqual(["b","a"]);
 });
 it("S03b unpaginated AG1 list over 250 and equal-day stable ordering",()=>{
  const large=Array.from({length:251},(_,i)=>({
   ...visit("v"+i),visitedOn:"2026-10-10",attachments:[],
  }));
  const result=projectVetVisits(large,"pet-A");
  expect(result).toHaveLength(251);
  expect(result.slice(0,2).map(v=>v.id)).toEqual(["v0","v1"]);
 });
 it("S04 empty success is allowed, not a real read",()=>{
  expect(projectVetVisits([],"pet-A")).toEqual([]);
 });
 it.each([
  ["not an array",{}],
  ["foreign pet",[visit("v1","pet-B")]],
  ["duplicate ids",[visit(),visit()]],
  ["bad visit id",[visit("../private")]],
  ["invalid date",[{...visit(),visitedOn:"2026-02-30"}]],
  ["future invalid date",[{...visit(),visitedOn:"2026-13-01"}]],
  ["bad attachment MIME",[{...visit(),attachments:[{...visit().attachments[0],mimeType:"application/javascript"}]}]],
  ["bad size",[{...visit(),attachments:[{...visit().attachments[0],sizeBytes:11000000}]}]],
  ["bad text",[{...visit(),diagnosis:"A".repeat(10001)}]],
  ["too many files",[{...visit(),attachments:Array(6).fill(visit().attachments[0])}]],
 ])("S05 malformed %s denied",(_name,data)=>{
  expect(()=>projectVetVisits(data,"pet-A")).toThrow();
 });
});
