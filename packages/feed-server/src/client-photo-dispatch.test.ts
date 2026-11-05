import { describe, expect, it, vi } from "vitest";
import { dispatchFeedRequest } from "./index.js";
import type { FeedService } from "@gafus/core/services/feed";

const upload = "8dc418f6-97da-42be-ab73-b3c172c95ccd";
const request = (route: string) => new Request(`https://x${route}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: "{}",
});

describe("Moments Mobile client-photo S3 routes", () => {
  it("signs phone-prepared WebP renditions via the user-owned upload", async () => {
    const reserveClientRenditions = vi.fn().mockResolvedValue({ small: {}, medium: {} });
    const posts = { reserveClientRenditions } as unknown as FeedService;
    const path = `/uploads/${upload}/client-renditions`;
    const result = await dispatchFeedRequest("owner", request(path), path, posts);
    expect(result).toEqual({ small: {}, medium: {} });
    expect(reserveClientRenditions).toHaveBeenCalledExactlyOnceWith("owner", upload);
  });
  it("publishes verified S3-only photo without Cloud.ru enqueue", async () => {
    const completeClientPhoto = vi.fn().mockResolvedValue({ mediaId: upload, status: "ready" });
    const posts = { completeClientPhoto } as unknown as FeedService;
    const enqueue = vi.fn();
    const path = `/uploads/${upload}/client-complete`;
    const result = await dispatchFeedRequest("owner", request(path), path, posts,
      undefined, undefined, undefined, enqueue);
    expect(result).toEqual({ mediaId: upload, status: "ready" });
    expect(completeClientPhoto).toHaveBeenCalledExactlyOnceWith("owner", upload);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
