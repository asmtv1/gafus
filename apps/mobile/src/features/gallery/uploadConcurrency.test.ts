import { describe, expect, it } from "vitest";
import { acquireGalleryUploadSlot, GALLERY_MOBILE_MAX_PARALLEL_UPLOADS } from "./uploadConcurrency";

describe("Gallery native global S3 upload pool", () => {
  it("admits five transfers, starts sixth only after a slot is released", async () => {
    expect(GALLERY_MOBILE_MAX_PARALLEL_UPLOADS).toBe(5);
    const releases = await Promise.all(Array.from({ length: 5 }, acquireGalleryUploadSlot));
    let sixthStarted = false;
    const sixth = acquireGalleryUploadSlot().then(release => {
      sixthStarted = true;
      return release;
    });
    await Promise.resolve();
    expect(sixthStarted).toBe(false);
    releases[0]();
    const releaseSixth = await sixth;
    expect(sixthStarted).toBe(true);
    // Releasing the first slot twice cannot accidentally admit another request.
    let seventhStarted = false;
    const seventh = acquireGalleryUploadSlot().then(release => {
      seventhStarted = true;
      return release;
    });
    releases[0]();
    await Promise.resolve();
    expect(seventhStarted).toBe(false);
    releaseSixth();
    const releaseSeventh = await seventh;
    expect(seventhStarted).toBe(true);
    releaseSeventh();
    for (const release of releases.slice(1)) release();
  });
});
