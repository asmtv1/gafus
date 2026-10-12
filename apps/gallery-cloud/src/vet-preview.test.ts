import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { createVetPreview } from "./vet-preview";

describe("private veterinary preview encoding", () => {
  it("generates a metadata-free bounded WebP thumbnail", async () => {
    const input = await sharp({
      create: { width: 1200, height: 950, channels: 3, background: "#b07040" },
    })
      .png()
      .withMetadata({ exif: { IFD0: { Copyright: "Do not export this private metadata" } } })
      .toBuffer();
    const out = await createVetPreview(input);
    const details = await sharp(out).metadata();
    expect(details.format).toBe("webp");
    expect(Math.max(details.width ?? 0, details.height ?? 0)).toBeLessThanOrEqual(640);
    expect(details.exif).toBeUndefined();
    expect(out.byteLength).toBeLessThanOrEqual(1_750_000);
  });
  it("fails closed on missing bytes and unrecognized formats", async () => {
    await expect(createVetPreview(new Uint8Array())).rejects.toThrow("IMAGE_SIZE");
    await expect(createVetPreview(new Uint8Array(10 * 1024 * 1024 + 1))).rejects.toThrow(
      "IMAGE_SIZE",
    );
  });
});
