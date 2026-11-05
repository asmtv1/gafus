import { describe, expect, it } from "vitest";
import { videoRetryMessage, videoServerFailureMessage } from "./videoRetryMessage";

describe("Mobile video retry guidance",()=>{
  it("shows actionable guidance for local codec, upload and unsupported media",()=>{
    expect(videoRetryMessage(new Error("LOCAL_VIDEO_TIMEOUT"))).toContain("H.264");
    expect(videoRetryMessage(new Error("Cloud S3 upload failed"))).toContain("интернет");
    expect(videoRetryMessage(new Error("unsupported mime"))).toContain("200 МБ");
    expect(videoServerFailureMessage).toContain("не запустит её заново");
  });
});
