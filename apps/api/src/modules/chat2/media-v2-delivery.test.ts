import { describe, expect, it } from "vitest";
import { chat2V2CdnOrigin, chat2V2Delivery } from "./media-v2-delivery.js";
import type { Chat2V2Manifest } from "@gafus/feed-cloud";
const image: Chat2V2Manifest = {
  kind: "image", width: 720, height: 480,
  keys: { small: "chat2/room/user/00000000-0000-4000-8000-000000000000/v1/image/s.webp",
    medium: "chat2/room/user/00000000-0000-4000-8000-000000000000/v1/image/m.webp" },
  imageSizes: { small: { width: 360, height: 240 }, medium: { width: 720, height: 480 } },
};
describe("Chat2 Cloud.ru S3 CDN delivery without VMs", () => {
  it("uses verified new-account S3 as direct delivery when CDN is not configured", () => {
    const d = chat2V2Delivery(image, {});
    expect(d.url).toBe("https://gafus-chat2-media-2026.s3.cloud.ru/" + image.keys.medium);
    expect("fallbackUrl" in d).toBe(false);
  });
  it("gives CDN first and exact S3 final variants for automatic outage fallback", () => {
    const d = chat2V2Delivery(image, { CHAT2_V2_CDN_BASE_URL: "https://chat2-example.begetcdn.cloud" });
    expect(d.url).toBe("https://chat2-example.begetcdn.cloud/" + image.keys.medium);
    expect(d.fallbackUrl).toBe("https://gafus-chat2-media-2026.s3.cloud.ru/" + image.keys.medium);
    expect(d.renditions.image?.[360]).toContain("chat2-example.begetcdn.cloud");
    expect(d.fallbackRenditions?.image?.[720]).toContain("gafus-chat2-media-2026.s3.cloud.ru");
  });
  it("maps a processed MP4 and poster to the same CDN/S3 key without HLS", () => {
    const base="chat2/room/user/00000000-0000-4000-8000-000000000000/v1/";
    const video:Chat2V2Manifest={
      kind:"video",width:1280,height:720,durationSeconds:30,
      posterKey:base+"poster.webp",
      renditions:[
        {quality:360,key:base+"video/360.mp4",width:640,height:360,bytes:90000},
        {quality:720,key:base+"video/720.mp4",width:1280,height:720,bytes:220000},
      ],
    };
    const result=chat2V2Delivery(video,{
      CHAT2_V2_CDN_BASE_URL:"https://chat2-example.begetcdn.cloud",
    });
    expect(result.url).toBe("https://chat2-example.begetcdn.cloud/"+base+"video/360.mp4");
    expect(result.renditions.poster).toBe("https://chat2-example.begetcdn.cloud/"+base+"poster.webp");
    expect(result.renditions.video?.[720]).toBe("https://chat2-example.begetcdn.cloud/"+base+"video/720.mp4");
    expect(result.fallbackRenditions?.video?.[720]).toBe(
      "https://gafus-chat2-media-2026.s3.cloud.ru/"+base+"video/720.mp4");
    expect(result.fallbackUrl).toContain("s3.cloud.ru/");
    expect(JSON.stringify(result)).not.toContain(".m3u8");
  });
  it("rejects credentialed, insecure or arbitrary CDN URLs", () => {
    for (const value of ["http://chat2.begetcdn.cloud", "https://evil.example",
      "https://chat2.begetcdn.cloud/private", "https://chat2.begetcdn.cloud/?key=x",
      "https://user:secret@chat2.begetcdn.cloud"]) {
      expect(() => chat2V2CdnOrigin({ CHAT2_V2_CDN_BASE_URL: value })).toThrow();
    }
  });
});
