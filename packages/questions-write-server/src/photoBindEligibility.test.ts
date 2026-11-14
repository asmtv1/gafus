import {describe,expect,it} from "vitest";
import {canBindQuestionPhoto} from "./photoBindEligibility";
const legacy={id:"old",url:"cloudru:questions:legacy",storagePath:"questions/old"};
const v2={id:"v2",url:"questions-v2:questions/v2/owner/media/v1/image/m.webp",
  storagePath:"questions-v2:questions/v2/owner/media/incoming/source.jpg"};
describe("Questions V2 photo bind authorization",()=>{
  it("accepts only confirmed and recoverable V2 tasks",()=>{
    expect(canBindQuestionPhoto(v2,new Set(["v2"]))).toBe(true);
    expect(canBindQuestionPhoto({...v2,url:""},new Set(["v2"]))).toBe(true);
  });
  it("never reattaches EXPIRED/FAILED V2 even if URL marker survives",()=>{
    expect(canBindQuestionPhoto(v2,new Set())).toBe(false);
    expect(canBindQuestionPhoto({...v2,url:""},new Set())).toBe(false);
  });
  it("preserves existing legacy read while rejecting empty legacy rows",()=>{
    expect(canBindQuestionPhoto(legacy,new Set())).toBe(true);
    expect(canBindQuestionPhoto({...legacy,url:""},new Set())).toBe(false);
  });
});
