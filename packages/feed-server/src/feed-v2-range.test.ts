import { describe, expect, it } from "vitest";
import { feedV2Range } from "./feed-v2-range.js";
describe("Feed V2 authorized HTTP Range response planning", () => {
  it("responds 200 to a complete MP4 with Accept-Ranges", () => {
    const r = feedV2Range(1000, null, "video/mp4");
    expect(r.status).toBe(200);
    expect(r.headers).toMatchObject({ "Accept-Ranges": "bytes", "Content-Length": "1000",
      "Content-Type": "video/mp4", "Cache-Control": "private, no-store" });
  });
  it("supports explicit start/end, open-ended and suffix ranges", () => {
    expect(feedV2Range(1000, "bytes=300-400", "video/mp4")).toMatchObject({ status: 206, start: 300,
      end: 400, headers: { "Content-Range": "bytes 300-400/1000", "Content-Length": "101" } });
    expect(feedV2Range(1000, "bytes=500-", "video/mp4")).toMatchObject({ status: 206, start: 500, end: 999 });
    expect(feedV2Range(1000, "bytes=-200", "video/mp4")).toMatchObject({ status: 206, start: 800, end: 999 });
    expect(feedV2Range(1000, "bytes=950-5000", "video/mp4")).toMatchObject({ status: 206, start: 950, end: 999 });
  });
  it("sends 416 for malformed/unsatisfiable requests; never leaks object content", () => {
    for (const range of ["bytes=1000-", "bytes=20-10", "bytes=-0", "bytes=", "bytes=0-1,4-5",
      "bytes=-1-4", "items=0-10", "bytes=99999999999999999999999999999-"]) {
      const result = feedV2Range(1000, range, "video/mp4");
      expect(result).toMatchObject({ status: 416, headers: { "Content-Range": "bytes */1000",
        "Content-Length": "0" } });
    }
  });
  it("rejects unknown object lengths rather than serving partial corrupt data", () => {
    expect(() => feedV2Range(0, null, "video/mp4")).toThrow();
    expect(() => feedV2Range(Number.MAX_SAFE_INTEGER + 1, null, "video/mp4")).toThrow();
  });
});
