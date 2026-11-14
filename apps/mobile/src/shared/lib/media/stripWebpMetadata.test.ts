import { describe, expect, it } from "vitest";
import { stripWebpMetadata } from "./stripWebpMetadata";

function chunk(tag: string, payload: number[]): Uint8Array {
  const size = payload.length;
  const out = new Uint8Array(8 + size + (size & 1));
  for (let i = 0; i < 4; i++) out[i] = tag.charCodeAt(i);
  for (let i = 0; i < 4; i++) out[4 + i] = (size >>> (8 * i)) & 0xff;
  out.set(payload, 8);
  return out;
}
function riff(chunks: Uint8Array[]): Uint8Array {
  const size = 12 + chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(size);
  out.set([82, 73, 70, 70], 0); // RIFF
  for (let i = 0; i < 4; i++) out[4 + i] = ((size - 8) >>> (8 * i)) & 0xff;
  out.set([87, 69, 66, 80], 8); // WEBP
  let at = 12;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
const features = (flags: number) => chunk("VP8X", [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const pixels = () => chunk("VP8 ", [1, 2, 3, 4, 5, 6]);

describe("metadata-free Feed video poster WebP", () => {
  it("keeps a clean WebP byte-for-byte unchanged", () => {
    const source = riff([features(0), pixels()]);
    expect(stripWebpMetadata(source)).toBe(source);
  });
  it("strips ICCP and clears the ICC flag without altering pixel bytes", () => {
    const source = riff([features(0x20), chunk("ICCP", [9, 8, 7]), pixels()]);
    const result = stripWebpMetadata(source);
    expect(result).toEqual(riff([features(0), pixels()]));
    expect(result.length).toBe(source.length - 12); // ICC payload + padding
  });
  it("removes EXIF/XMP too and preserves alpha and other flags", () => {
    const source = riff([
      features(0x3c), chunk("ICCP", [5]), chunk("EXIF", [1, 2]),
      chunk("XMP ", [3, 4, 5]), pixels(),
    ]);
    expect(stripWebpMetadata(source)).toEqual(riff([features(0x10), pixels()]));
  });
  it("refuses a metadata-bearing file without VP8X", () => {
    expect(() => stripWebpMetadata(riff([chunk("ICCP", [9]), pixels()])))
      .toThrow("VIDEO_POSTER_WEBP_INVALID_RIFF");
  });
  it("fails closed on truncated or malformed chunk lengths", () => {
    const source = riff([features(0x20), chunk("ICCP", [9, 8]), pixels()]);
    const invalid = source.slice();
    invalid[12 + 18 + 4] = 250;
    expect(() => stripWebpMetadata(invalid)).toThrow("VIDEO_POSTER_WEBP_INVALID_RIFF");
    expect(() => stripWebpMetadata(source.slice(0, -1)))
      .toThrow("VIDEO_POSTER_WEBP_INVALID_RIFF");
  });
});
