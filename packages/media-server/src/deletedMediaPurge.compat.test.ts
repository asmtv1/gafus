import { describe, expect, it } from "vitest";
import {
  deletedMediaPurgePaths as legacyPure,
  enqueueDeletedMediaPurge,
} from "./deletedMediaPurge.js";
import { deletedMediaPurgePaths as sharedPure } from "@gafus/media-shared/purge-paths";

describe("media-server durable CDN purge compatibility", () => {
  it("exports the identical immutable allowlist policy", () => {
    expect(legacyPure).toBe(sharedPure);
  });

  it("keeps the SQL enqueue adapter guarded by the exact storage provider", async () => {
    const calls: unknown[] = [];
    const tx = {
      $executeRaw: (...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve(1);
      },
    };
    await enqueueDeletedMediaPurge(tx as never, "feed", "job-1", ["media/v2/m/v1/video/720.mp4"], {
      FEED_CDN_PROVIDER: "yandex",
    });
    expect(calls).toHaveLength(0);
    await expect(
      enqueueDeletedMediaPurge(tx as never, "feed", "job-1", ["media/v2/m/v1/video/720.mp4"], {
        FEED_CDN_PROVIDER: "beget",
        FEED_S3_ENDPOINT: "https://foreign.invalid",
      }),
    ).rejects.toThrow("MEDIA_PURGE_STORAGE_UNVERIFIED");
    expect(calls).toHaveLength(0);
  });
});
