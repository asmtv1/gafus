import { describe, expect, it } from "vitest";
import { isCacheableChat2FinalUrl } from "./publicFinalCache";

const key = "/chat2/owner123/room456/00000000-0000-4000-8000-000000000000/v1/";
describe("native Chat2 public media disk cache safety", () => {
  it("accepts only final immutable WebP and MP4 from approved public CDN/S3", () => {
    for (const host of ["gonomudedoje.begetcdn.cloud","gafus-chat2-media-2026.s3.cloud.ru"]) {
      for (const suffix of ["image/s.webp","image/m.webp","poster.webp","video/360.mp4","video/720.mp4","video/1080.mp4"])
        expect(isCacheableChat2FinalUrl("https://" + host + key + suffix)).toBe(true);
    }
  });
  it("denies unprocessed sources, arbitrary or signed storage and altered URLs", () => {
    const prefix="https://gonomudedoje.begetcdn.cloud";
    const valid=prefix+key+"video/360.mp4";
    for (const bad of [
      valid+"?token=1",valid+"#fragment",
      valid.replace("https:","http:"),
      valid.replace("gonomudedoje.begetcdn.cloud","other.begetcdn.cloud"),
      valid.replace("begetcdn.cloud","begetcdn.cloud.evil.test"),
      valid.replace("/video/360.mp4","/incoming/source.mp4"),
      valid.replace("/video/360.mp4","/video/original.mp4"),
      valid.replace("/video/360.mp4","/video/360.m3u8"),
      valid.replace("/video/360.mp4","/private/photo.webp"),
      valid.replace("/video/360.mp4","/../video/360.mp4"),
      "https://s3.cloud.ru/gafus-gallery-private"+key+"video/360.mp4?X-Amz-Signature=x",
    ]) expect(isCacheableChat2FinalUrl(bad)).toBe(false);
  });
});
