import {describe,it,expect} from "vitest";
import {photoRetryMessage} from "./photoRetryMessage";
describe("safe browser photo upload recovery advice",()=>{
 it("explains local encode error without suggesting missing Jobs",()=>{
  const text=photoRetryMessage(Error("sharp transform unexpectedly failed"));
  expect(text).toContain("устройстве");expect(text).toContain("круглую стрелку");
 });
 it("maps network and invalid codec without exposing signed secrets",()=>{
  expect(photoRetryMessage(Error("S3 timeout X-Amz-Signature=SECRET"))).toContain("интернет");
  expect(photoRetryMessage(Error("invalid image mime"))).toContain("JPG");
  expect(photoRetryMessage(Error("invalid image mime"))).not.toContain("invalid");
 });
});
