import { describe,expect,it } from "vitest";
import type { QuestionPhotoDto } from "@gafus/types";
import {questionPhotoPending,questionPhotoTerminalNotice} from "./photoDisplay";
const photo=(status:QuestionPhotoDto["status"]):QuestionPhotoDto=>({id:"a",url:"",status});
describe("native photo media states match Web",()=>{
  it("distinguishes external legacy files from processing failure and never suggests retrying either",()=>{
    expect(questionPhotoTerminalNotice([photo("UNAVAILABLE")])).toContain("из прежнего хранилища");
    expect(questionPhotoTerminalNotice([photo("FAILED")])).toContain("замените его");
    expect(questionPhotoTerminalNotice([photo("READY")])).toBeNull();
    expect(questionPhotoTerminalNotice([photo("UNAVAILABLE"),photo("FAILED")])).toContain("исходный файл");
  });
  it("polls only pending photos, never READY, FAILED or UNAVAILABLE",()=>{
    for (const status of ["QUEUED","AWAITING_UPLOAD","PROCESSING"] as const)
      expect(questionPhotoPending([photo(status)])).toBe(true);
    for (const status of ["READY","FAILED","UNAVAILABLE","EXPIRED"] as const)
      expect(questionPhotoPending([photo(status)])).toBe(false);
  });
});
