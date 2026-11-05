import { describe, expect, it } from "vitest";
import { HeadObjectCommand, GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { verifyClientWebp } from "./clientPhotoRenditions";

function objectFrom(bytes: Buffer): S3Client {
  return {
    send: async (command: unknown) => {
      if (command instanceof HeadObjectCommand) return {
        ContentLength: bytes.length, ContentType: "image/webp", ETag: '"photo-etag"',
      };
      if (command instanceof GetObjectCommand) return {
        Body: { transformToByteArray: async () => bytes },
      };
      throw Error("Unexpected S3 command");
    },
  } as unknown as S3Client;
}
const edge=1440;
const key="questions/v2/actor/00000000-0000-4000-8000-000000000004/incoming/source.webp";

describe("Chat2 and Questions client-prepared main WebP server verifier", () => {
  it.each([[1440,900],[900,1440]] as const)(
    "accepts a real WebP %s×%s at the new 1440px bound", async (width,height)=>{
      const payload=await sharp({create:{width,height,channels:3,background:"#738c5a"}})
        .webp({quality:80}).toBuffer();
      const verified=await verifyClientWebp(objectFrom(payload),"private-photo-bucket",key,edge,1_750_000);
      expect(verified).toMatchObject({width,height,bytes:payload.length});
    });
  it.each([[1441,900],[900,1441]] as const)(
    "rejects a decoded WebP %s×%s exceeding the new photo bound",async (width,height)=>{
      const payload=await sharp({create:{width,height,channels:3,background:"#738c5a"}})
        .webp({quality:80}).toBuffer();
      await expect(verifyClientWebp(objectFrom(payload),"private-photo-bucket",key,edge,1_750_000))
        .rejects.toThrow("CLIENT_PHOTO_UNVERIFIED_IMAGE");
    });
});
