/**
 * Opt-in genuine Hono → Core Prisma/isolated PG18 ACL → signed MinIO GET.
 * Nothing connects to shared/production DB, Cloud.ru, Yandex or Beget.
 * Run only with WEB3_PREVIEW_REAL_ACCEPTANCE=yes and project-only PG/S3.
 */
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { prisma } from "@gafus/prisma";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { signPosterMock } = vi.hoisted(() => ({ signPosterMock: vi.fn() }));
vi.mock("@gafus/cdn-upload", async importOriginal => ({
  ...(await importOriginal<Record<string,unknown>>()),
  getSignedDownloadUrl: signPosterMock,
}));
// The monetization gate is covered by training.validation.test.ts; here the
// actual authorization service and PostgreSQL queries must stay unmocked.
vi.mock("@gafus/core/services/rewardedCredits", async importOriginal => ({
  ...(await importOriginal<Record<string,unknown>>()),
  requirePremiumOrRewardedAccessForVideoUrl: vi.fn().mockResolvedValue(null),
}));

import { trainingRoutes, invalidateVideoPlaybackAccessCache } from "./training";

const project = "/Users/asmtv1/Desktop/gafus-refactor";
const scratchSocket = project + "/.design-verify/w3s";
const credentialsPath = project + "/.design-verify/web3-preview-s3/credentials.json";
const S3_ENDPOINT = "http://127.0.0.1:9633";
const tag = "web3pv"+randomBytes(4).toString("hex");
const ownerId = tag + "trainer";
const visitorId = tag + "visitor";
const videoId = tag + "video";
const bucket = tag + "-media";
const objectKey = `uploads/trainers/${ownerId}/videocourses/${videoId}/hls/poster.jpg`;
const originalUrl = `https://storage.yandexcloud.net/gafus-media/uploads/trainers/${ownerId}/videocourses/${videoId}/original.mp4`;
// A real synthetic JPEG is embedded so skipped CI tests never depend on
// temporary user files, while opt-in runs still GET identical MinIO bytes.
const testImage = Buffer.from(
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjExLjEwMAD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBg" +
  "YGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABNAAEBAAAAAAAAAAAA" +
  "AAAAAAAABgEBAQEAAAAAAAAAAAAAAAAAAAMEEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAA" +
  "AA/8AAEQgBaAKAAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AgAGVEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAB//9k=",
  "base64");
let sdk: Record<string, new(input:Record<string,unknown>)=>unknown>;
let s3: {send: (cmd:unknown)=>Promise<unknown>;destroy:()=>void} | undefined;
let signer: ((client:unknown, command:unknown, options:unknown)=>Promise<string>) | undefined;
let inserted = false;
let ownBucket = false;
const app = new Hono();
app.use("*", async (c,next)=>{
  c.set("user",{
    id:c.req.header("x-web3-actor")==="visitor"?visitorId:ownerId,
    username:"web3_preview_actor",role:"USER",
  });
  await next();
});
app.route("/api/v1/training",trainingRoutes);
const preview = (actor:"owner"|"visitor"="owner")=>
  app.request("/api/v1/training/video/preview?videoUrl="+encodeURIComponent(originalUrl),{
    headers:{"x-web3-actor":actor},
  });

beforeAll(async()=>{
  assert.equal(realpathSync(project),project);
  assert.equal(process.env.WEB3_PREVIEW_REAL_ACCEPTANCE,"yes");
  assert.equal(realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    "../../../../..")),project);
  const db = new URL(process.env.DATABASE_URL || "");
  assert.equal(db.hostname,"localhost");
  assert.equal(db.port,"55983");
  assert.equal(db.pathname,"/web3_preview_private");
  assert.equal(db.searchParams.get("host"),scratchSocket);
  assert.equal(db.username,os.userInfo().username);
  assert.equal(db.password,"");
  const mode = statSync(credentialsPath);
  assert.equal(mode.mode & 0o077,0);
  assert.equal(realpathSync(credentialsPath),credentialsPath);
  const creds=JSON.parse(readFileSync(credentialsPath,"utf8")) as {
    accessKeyId:string;secretAccessKey:string;
  };
  const requireFromCdn=createRequire(project + "/packages/cdn-upload/package.json");
  sdk=requireFromCdn("@aws-sdk/client-s3") as typeof sdk;
  signer=(requireFromCdn("@aws-sdk/s3-request-presigner") as {
    getSignedUrl:typeof signer;
  }).getSignedUrl;
  const Constructor=sdk.S3Client as new(x:unknown)=>typeof s3;
  s3=new Constructor({
    region:"us-east-1",endpoint:S3_ENDPOINT,forcePathStyle:true,
    credentials:{accessKeyId:creds.accessKeyId,secretAccessKey:creds.secretAccessKey},
    maxAttempts:1,
  });
  assert.ok(s3);
  // New bucket belongs only to this one test run; no shared bucket reads/writes.
  const CreateBucket=sdk.CreateBucketCommand;
  await s3.send(new CreateBucket({Bucket:bucket}));
  ownBucket=true;
  const PutObject=sdk.PutObjectCommand;
  await s3.send(new PutObject({Bucket:bucket,Key:objectKey,Body:testImage,ContentType:"image/jpeg"}));
  signPosterMock.mockImplementation(async (requestedKey:string,ttl:number)=>{
    assert.equal(requestedKey,objectKey);
    assert.equal(ttl,300);
    assert.ok(s3&&signer);
    const GetObject=sdk.GetObjectCommand;
    return signer(s3,new GetObject({Bucket:bucket,Key:requestedKey}),{expiresIn:ttl});
  });
  await prisma.$connect();
  // This brand-new isolated schema had zero rows before the fixture was seeded.
  await prisma.user.createMany({data:[
    {id:ownerId,username:tag+"trainer",role:"TRAINER",password:"test-only-not-a-real-password"},
    {id:visitorId,username:tag+"visitor",role:"USER",password:"test-only-not-a-real-password"},
  ]});
  await prisma.trainerVideo.create({data:{
    id:videoId,trainerId:ownerId,relativePath:objectKey,
    originalName:"synthetic.mp4",mimeType:"video/mp4",fileSize:2600n,
    transcodingStatus:"COMPLETED",hlsManifestPath:
      `uploads/trainers/${ownerId}/videocourses/${videoId}/hls/playlist.m3u8`,
    thumbnailPath:objectKey,
  }});
  inserted=true;
  invalidateVideoPlaybackAccessCache();
},90000);

afterAll(async()=>{
  try {
    if(inserted){
      await prisma.trainerVideo.deleteMany({where:{id:videoId}});
      await prisma.user.deleteMany({where:{id:{in:[ownerId,visitorId]}}});
      invalidateVideoPlaybackAccessCache();
    }
  } finally {
    await prisma.$disconnect();
    if(s3 && ownBucket){
      const DeleteObject=sdk.DeleteObjectCommand;
      const DeleteBucket=sdk.DeleteBucketCommand;
      await s3.send(new DeleteObject({Bucket:bucket,Key:objectKey}));
      await s3.send(new DeleteBucket({Bucket:bucket}));
    }
    s3?.destroy();
  }
},90000);

describe.runIf(process.env.WEB3_PREVIEW_REAL_ACCEPTANCE === "yes")(
  "WEB3 real isolated Hono Prisma PostgreSQL18 and MinIO preview",()=>{
    it("authorizes trainer owner, signs five-minute JPEG and retrieves exact real S3 bytes",async()=>{
      const response=await preview("owner");
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const json=await response.json() as {success:boolean;data:{posterUrl:string}};
      expect(json.success).toBe(true);
      expect(Object.keys(json.data)).toEqual(["posterUrl"]);
      const url=new URL(json.data.posterUrl);
      expect(url.origin).toBe(S3_ENDPOINT);
      expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
      const signed=await fetch(url);
      expect(signed.status).toBe(200);
      expect(Buffer.from(await signed.arrayBuffer()).equals(testImage)).toBe(true);
      const publicUrl=new URL(url);
      publicUrl.search="";
      expect((await fetch(publicUrl)).status).toBe(403);
      const modified=new URL(url);
      modified.searchParams.set("X-Amz-Expires","301");
      expect((await fetch(modified)).status).toBe(403);
    });
    it("real PostgreSQL owner ACL denies another user without S3 sign",async()=>{
      signPosterMock.mockClear();
      invalidateVideoPlaybackAccessCache();
      const response=await preview("visitor");
      expect(response.status).toBe(403);
      expect(signPosterMock).not.toHaveBeenCalled();
    });
    it("real PostgreSQL PROCESSING state suppresses signed thumbnail",async()=>{
      signPosterMock.mockClear();
      await prisma.trainerVideo.update({where:{id:videoId},data:{transcodingStatus:"PROCESSING"}});
      invalidateVideoPlaybackAccessCache();
      const response=await preview("owner");
      expect(response.status).toBe(404);
      expect(signPosterMock).not.toHaveBeenCalled();
    });
  },
);
