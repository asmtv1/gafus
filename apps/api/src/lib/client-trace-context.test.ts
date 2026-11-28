import { describe, it, expect } from "vitest";
import { clientTraceAttributes } from "./client-trace-context";
const read=(values:Record<string,string>)=>(name:string)=>values[name];
describe("bounded diagnostic release identity",()=>{
  it("records native version, build and compiled OTA revision",()=>{
    expect(clientTraceAttributes(read({"x-client-platform":"ios","x-client-version":"1.7.6",
      "x-client-build":"101","x-client-ota-revision":"0"}))).toEqual({
      "gafus.client_platform":"ios","gafus.client_version":"1.7.6","gafus.client_build":"101","gafus.ota_revision":0,
    });
  });
  it("omits arbitrary, malformed, overlong and cross-platform values",()=>{
    expect(clientTraceAttributes(read({"x-client-platform":"android","x-client-version":"user-private@example.com",
      "x-client-build":"9999999999","x-client-ota-revision":"-1"}))).toEqual({"gafus.client_platform":"android"});
    expect(clientTraceAttributes(read({"x-client-platform":"web","x-client-version":"2.3.4",
      "x-client-build":"42","x-client-ota-revision":"1"}))).toEqual({"gafus.client_platform":"web","gafus.client_version":"2.3.4"});
    expect(clientTraceAttributes(read({"x-client-platform":"user-123","x-client-version":"1.2.3"}))).toEqual({});
  });
});
