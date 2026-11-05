import { describe, expect, it } from "vitest";
import { videoRetryMessage, videoServerFailureMessage } from "./videoRetryMessage";

describe("Web video recovery instructions",()=>{
  it("directs a local encoder failure to per-file native/browser retry, without promising a Cloud Job",()=>{
    expect(videoRetryMessage(new Error("LOCAL_VIDEO_TIMEOUT"))).toContain("круглую стрелку");
    expect(videoRetryMessage(new Error("LOCAL_VIDEO_TIMEOUT"))).not.toContain("интернет");
  });
  it("suggests a supported browser when local encoding is unavailable",()=>{
    expect(videoRetryMessage(new Error("LOCAL_VIDEO_BROWSER_UNSUPPORTED"))).toContain("Chrome");
    expect(videoRetryMessage(new Error("LOCAL_VIDEO_INVALID"))).toContain("Файл видео повреждён");
  });
  it("distinguishes S3 transport, size/format and backend job failure",()=>{
    expect(videoRetryMessage(new Error("S3 connection lost"))).toContain("интернет");
    expect(videoRetryMessage(new Error("video too large"))).toContain("200 МБ");
    expect(videoServerFailureMessage).toContain("не запускает обработку заново");
  });
});
