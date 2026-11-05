import { describe, expect, it } from "vitest";
import { copyVerifiedClientWebp, verifyClientWebp } from "@gafus/cdn-upload";
import type { S3Client } from "@aws-sdk/client-s3";

// Valid, actual 40×20 WebP produced by Sharp. The server must verify/decode it,
// not accept a forged Content-Type, dimension, or an arbitrary uploaded payload.
const webp = Buffer.from(
  "UklGRkQAAABXRUJQVlA4IDgAAAAwAwCdASooABQAPm02l0ikIyIhJWgAgA2JZwDQkA8KmggAAP7nMP/3N9kfxzSH2HJtdBGincIAAA==",
  "base64",
);
const etag = '"0123456789abcdef0123456789abcdef"';
const key = "questions/v2/user/00000000-0000-4000-8000-000000000001/incoming/source.webp";

function fakeS3(options: {
  bytes?: Uint8Array;
  mime?: string;
  length?: number;
} = {}) {
  const operations: { name: string; input: Record<string, unknown> }[] = [];
  const bytes = options.bytes ?? webp;
  const metadata = () => ({ ETag: etag, ContentLength: options.length ?? bytes.byteLength,
    ContentType: options.mime ?? "image/webp" });
  const client = {
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      operations.push({ name: command.constructor.name, input: command.input });
      if (command.constructor.name === "HeadObjectCommand") return metadata();
      if (command.constructor.name === "GetObjectCommand") return {
        Body: { transformToByteArray: async () => bytes },
      };
      if (command.constructor.name === "CopyObjectCommand") return { CopyObjectResult: { ETag: etag } };
      throw Error("Unexpected S3 command");
    },
  } as unknown as S3Client;
  return { client, operations };
}

describe("client photo S3 validation before READY (zero transcoding)", () => {
  it("HEAD-verifies and fully decodes a valid WebP, then returns trusted dimensions", async () => {
    const { client, operations } = fakeS3();
    const result = await verifyClientWebp(client, "gafus-questions-public", key, 720, 1_750_000);
    expect(result).toEqual({ width: 40, height: 20, bytes: webp.byteLength, etag });
    expect(operations.map(op => op.name)).toEqual(["HeadObjectCommand", "GetObjectCommand"]);
    expect(operations[1]?.input.IfMatch).toBe(etag);
  });

  it("refuses forged MIME and exceeds dimensions (never silently resizes on server)", async () => {
    await expect(verifyClientWebp(fakeS3({ mime: "image/jpeg" }).client,
      "bucket", key, 720)).rejects.toThrow("CLIENT_PHOTO_UNVERIFIED_HEAD");
    await expect(verifyClientWebp(fakeS3().client,
      "bucket", key, 30)).rejects.toThrow("CLIENT_PHOTO_UNVERIFIED_IMAGE");
  });

  it("refuses mismatched HEAD/body lengths and corrupt bytes without promotion to READY", async () => {
    await expect(verifyClientWebp(fakeS3({ length: webp.length + 1 }).client,
      "bucket", key, 720)).rejects.toThrow("CLIENT_PHOTO_UNVERIFIED_BYTES");
    await expect(verifyClientWebp(fakeS3({ bytes: new Uint8Array(200) }).client,
      "bucket", key, 720)).rejects.toThrow();
  });

  it("copies verified objects within S3 using source ETag; never uploads image bytes", async () => {
    const { client, operations } = fakeS3();
    const verified = await verifyClientWebp(client, "bucket", key, 720);
    const final = "questions/uploads/questions/v2/user/00000000-0000-4000-8000-000000000001/v1/image/m.webp";
    await copyVerifiedClientWebp(client, "bucket", key, final, verified);
    expect(operations.map(op => op.name)).toEqual([
      "HeadObjectCommand", "GetObjectCommand", "CopyObjectCommand", "HeadObjectCommand",
    ]);
    expect(operations[2]?.input).toMatchObject({
      Bucket: "bucket", Key: final, CopySourceIfMatch: etag,
      ContentType: "image/webp", MetadataDirective: "REPLACE",
    });
    expect(operations[2]?.input).not.toHaveProperty("Body");
  });
});
