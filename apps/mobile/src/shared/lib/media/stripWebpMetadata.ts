/**
 * Remove non-pixel metadata from an Expo-generated WebP poster without
 * transcoding or changing its dimensions. Android's ImageManipulator embeds
 * an sRGB ICCP chunk that the Feed S3 verifier correctly rejects.
 *
 * WebP is a RIFF container: each chunk has an 8-byte header, little-endian
 * payload length, and one padding byte when the payload is odd-sized.
 * Preserve pixel/alpha/animation chunks byte-for-byte; only discard metadata
 * and clear the corresponding flags in VP8X.
 */
export function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
  const length = bytes.byteLength;
  const fail = (): never => { throw new Error("VIDEO_POSTER_WEBP_INVALID_RIFF"); };
  if (length < 20 || length > 1_750_000) fail();
  const ascii = (at: number, value: string) =>
    [...value].every((char, i) => bytes[at + i] === char.charCodeAt(0));
  const le32 = (at: number) =>
    (bytes[at]! | (bytes[at + 1]! << 8) |
      (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0;
  if (!ascii(0, "RIFF") || !ascii(8, "WEBP") || le32(4) !== length - 8) fail();

  const keep: Array<{ start: number; end: number; vp8x: boolean }> = [];
  let position = 12;
  let removed = false;
  let hasVp8x = false;
  while (position < length) {
    if (position + 8 > length) fail();
    const payload = le32(position + 4);
    const end = position + 8 + payload + (payload & 1);
    if (end > length || end <= position) fail();
    const isVp8x = ascii(position, "VP8X");
    if (isVp8x) {
      if (hasVp8x || payload !== 10) fail();
      hasVp8x = true;
    }
    const isMetadata = ascii(position, "ICCP") ||
      ascii(position, "EXIF") || ascii(position, "XMP ");
    if (isMetadata) removed = true;
    else keep.push({ start: position, end, vp8x: isVp8x });
    position = end;
  }
  if (!removed) return bytes;
  // ICCP/EXIF/XMP are legal only in extended WebP (VP8X).
  if (!hasVp8x) fail();
  const size = 12 + keep.reduce((sum, chunk) => sum + chunk.end - chunk.start, 0);
  const result = new Uint8Array(size);
  result.set(bytes.subarray(0, 12));
  const riff = size - 8;
  for (let i = 0; i < 4; i++) result[4 + i] = (riff >>> (8 * i)) & 0xff;
  let offset = 12;
  for (const chunk of keep) {
    result.set(bytes.subarray(chunk.start, chunk.end), offset);
    if (chunk.vp8x) {
      // VP8X feature flags: ICC 0x20, EXIF 0x08, XMP 0x04.
      result[offset + 8] = result[offset + 8]! & ~0x2c;
    }
    offset += chunk.end - chunk.start;
  }
  return result;
}
