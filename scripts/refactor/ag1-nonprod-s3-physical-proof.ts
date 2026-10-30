/** Opt-in real loopback S3 acceptance. No mocks, no production endpoint or credentials. */
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import {
  S3Client, CreateBucketCommand, HeadBucketCommand, HeadObjectCommand,
  GetObjectCommand, DeleteObjectCommand, PutObjectCommand, GetBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isolatedNonprodS3Config } from "../../packages/cdn-upload/src/isolatedNonprodS3";
import {
  uploadPrivateUserMedia, signPrivateUserMedia, deletePrivateUserMedia,
  parsePrivateMediaLocation,
} from "../../packages/cdn-upload/src/privateUserMedia";
import { galleryStorageConfigFromEnv } from "../../packages/gallery-storage/src/config";
import { createGalleryObjectStore, createGalleryS3Client } from "../../packages/gallery-storage/src/objects";
import { createGalleryStorageFromEnv } from "../../packages/gallery-storage/src/index";
import { feedStorageConfigFromEnv, createFeedStorage } from "../../packages/feed-storage/src/storage";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
if (realpathSync(process.cwd()) !== ROOT || process.env.GAFUS_NONPROD_S3_REAL_ACCEPTANCE !== "yes")
  throw new Error("S3_ACCEPTANCE_NOT_EXPLICITLY_AUTHORIZED");
const env = {
  ...process.env, NODE_ENV: "development", GAFUS_LOCAL_ISOLATED_API: "1",
  GAFUS_ISOLATED_NONPROD_S3: "enabled",
  GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
  GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET: "gafus-refactor-documents-test",
  GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-refactor-gallery-test",
  GAFUS_ISOLATED_S3_FEED_BUCKET: "gafus-refactor-feed-test",
  GALLERY_ENABLED: "true", FEED_ENABLED: "true",
};
const configs = (["documents", "gallery", "feed"] as const).map(kind => {
  const config = isolatedNonprodS3Config(kind, env);
  if (!config) throw new Error("LOCAL_CREDENTIALS_MISSING");
  return { kind, config };
});
Object.assign(process.env, env);
const s3 = new S3Client({
  endpoint: "http://127.0.0.1:9000", region: "us-east-1", forcePathStyle: true,
  credentials: {
    accessKeyId: configs[0]!.config.accessKeyId,
    secretAccessKey: configs[0]!.config.secretAccessKey,
  }, maxAttempts: 1, requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const ownObjects: { bucket: string; key: string }[] = [];
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error("S3_ACCEPTANCE_FAILED:" + message);
}
function code(error: unknown) {
  return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
}
async function textBody(bucket: string, key: string) {
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return await result.Body!.transformToString();
}
async function postForm(url: string, fields: Record<string,string>, bytes: string) {
  const form = new FormData();
  for (const [key,value] of Object.entries(fields)) form.append(key,value);
  form.append("file", new Blob([bytes], { type: "image/jpeg" }), "source.jpg");
  const response = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(10000) });
  check(response.status === 204, `POST_FORM_${response.status}`);
}
async function main() {
  try {
    for (const { kind,config } of configs) {
      try { await s3.send(new HeadBucketCommand({ Bucket:config.bucket })); }
      catch (error) {
        check(code(error) === 404, `${kind}_HEAD_BUCKET_UNEXPECTED`);
        await s3.send(new CreateBucketCommand({ Bucket:config.bucket }));
      }
      try {
        await s3.send(new GetBucketPolicyCommand({ Bucket:config.bucket }));
        throw new Error("S3_ACCEPTANCE_FAILED:PUBLIC_OR_UNVERIFIED_BUCKET_POLICY");
      } catch(error) {
        check(code(error) === 404, `${kind}_BUCKET_POLICY_MUST_BE_ABSENT`);
      }
    }
    const id = randomUUID();
    const docs = configs[0]!.config;
    const relativePath = `users/ag1proof/pets/${id}/documents/${id}.pdf`;
    const location = await uploadPrivateUserMedia(
      "documents", relativePath, Buffer.from("%PDF-1.4 isolated-real-test"), "application/pdf", env,
    );
    const parsed = parsePrivateMediaLocation(location)!;
    ownObjects.push({ bucket:docs.bucket, key:parsed.key });
    check((await s3.send(new HeadObjectCommand({ Bucket:docs.bucket, Key:parsed.key }))).ContentLength! > 0,
      "DOCUMENTS_REAL_HEAD");
    check((await textBody(docs.bucket,parsed.key)).startsWith("%PDF-1.4"), "DOCUMENTS_REAL_GET");
    const signed = new URL(await signPrivateUserMedia(location, 60, "proof.pdf"));
    check(signed.origin === docs.endpoint && signed.searchParams.get("X-Amz-Expires") === "60",
      "DOCUMENTS_SIGNED_URL_LOCAL_ONLY");
    check((await fetch(signed, { signal:AbortSignal.timeout(5000) })).status === 200,
      "DOCUMENTS_SIGNED_DOWNLOAD");
    check((await fetch(`${docs.endpoint}/${docs.bucket}/${parsed.key}`)).status === 403,
      "DOCUMENTS_ANONYMOUS_DENIED");
    const altered = new URL(signed);
    altered.searchParams.set("X-Amz-Signature", "0".repeat(64));
    check((await fetch(altered)).status === 403, "DOCUMENTS_TAMPER_DENIED");
    const shortUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket:docs.bucket, Key:parsed.key }),
      { expiresIn:1 });
    check((await fetch(shortUrl)).status === 200, "DOCUMENTS_SHORT_SIGNATURE_LIVE");
    await new Promise(resolve=>setTimeout(resolve,2500));
    check((await fetch(shortUrl)).status === 403, "DOCUMENTS_SHORT_SIGNATURE_EXPIRED");
    await deletePrivateUserMedia(location);
    ownObjects.pop();
    try { await s3.send(new HeadObjectCommand({ Bucket:docs.bucket, Key:parsed.key }));
      throw new Error("S3_ACCEPTANCE_FAILED:DOCUMENTS_DELETE_STILL_VISIBLE");
    } catch(error) { check(code(error) === 404, "DOCUMENTS_DELETE_HEAD404"); }
    console.log("PASS: documents adapter PUT HEAD GET signed URL anonymous/tamper/expiry deny DELETE HEAD404");

    const galleryConfig = galleryStorageConfigFromEnv(env);
    const galleryClient = createGalleryS3Client(galleryConfig);
    try {
      const galleryStore = createGalleryObjectStore(galleryConfig, galleryClient);
      const key = `albums/ag1proof/${id}/photos/${id}/full.webp`;
      ownObjects.push({ bucket:galleryConfig.bucket, key });
      await galleryStore.create(key, Buffer.from("isolated-gallery-proof"), "image/webp");
      check((await galleryStore.head(key))?.bytes === "isolated-gallery-proof".length, "GALLERY_REAL_HEAD");
      check((await galleryStore.read(key)).bytes.length === "isolated-gallery-proof".length, "GALLERY_REAL_GET");
      const gallerySigned = await createGalleryStorageFromEnv(env).signCdn({
        key, expiresAt: new Date(Date.now() + 120_000),
      });
      const galleryResponse = await fetch(gallerySigned, { signal: AbortSignal.timeout(5000) });
      check(galleryResponse.status === 200 && (await galleryResponse.text()) === "isolated-gallery-proof",
        "GALLERY_REAL_SIGNED_FINAL_GET");
      check((await fetch(`http://127.0.0.1:9000/${galleryConfig.bucket}/${key}`)).status === 403,
        "GALLERY_ANONYMOUS_FINAL_DENIED");
      const galleryPost = await createGalleryStorageFromEnv(env).presignPost({
        key: `albums/ag1proof/${id}/incoming/${id}/source.jpg`, contentType:"image/jpeg",
        maxBytes:10*1024*1024, expiresAt:new Date(Date.now()+120_000),
      });
      const galleryPostedKey = `albums/ag1proof/${id}/incoming/${id}/source.jpg`;
      ownObjects.push({bucket:galleryConfig.bucket,key:galleryPostedKey});
      await postForm(galleryPost.url,galleryPost.fields,"gallery-presigned-post-proof");
      check((await galleryStore.head(galleryPostedKey))?.bytes === "gallery-presigned-post-proof".length,
        "GALLERY_REAL_PRESIGNED_POST_HEAD");
      await galleryStore.delete(galleryPostedKey);
      check(await galleryStore.head(galleryPostedKey) === null, "GALLERY_SOURCE_DELETE_HEAD404");
      ownObjects.pop();
      await galleryStore.delete(key);
      check(await galleryStore.head(key) === null, "GALLERY_FINAL_DELETE_HEAD404");
      ownObjects.pop();
    } finally { galleryClient.destroy(); }
    console.log("PASS: gallery PUT HEAD GET DELETE + presigned POST + signed final GET / anonymous 403");

    const feedConfig = feedStorageConfigFromEnv(env);
    const feed = createFeedStorage(feedConfig);
    const feedKey = `posts/ag1proof/${id}/incoming/${id}/source.jpg`;
    ownObjects.push({bucket:feedConfig.bucket,key:feedKey});
    const form = await feed.presignPost({ key:feedKey, contentType:"image/jpeg",
      maxBytes:10*1024*1024, expiresAt:new Date(Date.now()+120_000) });
    await postForm(form.url,form.fields,"feed-presigned-post-proof");
    check((await feed.head(feedKey))?.bytes === "feed-presigned-post-proof".length,
      "FEED_REAL_PRESIGNED_POST_HEAD");
    check((await textBody(feedConfig.bucket,feedKey)) === "feed-presigned-post-proof", "FEED_REAL_GET");
    await s3.send(new DeleteObjectCommand({Bucket:feedConfig.bucket,Key:feedKey}));
    ownObjects.pop();
    try { await s3.send(new HeadObjectCommand({Bucket:feedConfig.bucket,Key:feedKey}));
      throw new Error("S3_ACCEPTANCE_FAILED:FEED_DELETE_STILL_VISIBLE");
    } catch(error) { check(code(error) === 404,"FEED_DELETE_HEAD404"); }
    const finalKey = `posts/ag1proof/${id}/attachments/${id}/full.webp`;
    ownObjects.push({bucket:feedConfig.bucket,key:finalKey});
    await s3.send(new PutObjectCommand({Bucket:feedConfig.bucket,Key:finalKey,
      Body:Buffer.from("feed-private-final-proof"),ContentType:"image/webp"}));
    const signedFinal = await feed.signCdn({key:finalKey,expiresAt:new Date(Date.now()+120_000)});
    const signedResponse = await fetch(signedFinal,{signal:AbortSignal.timeout(5000)});
    check(signedResponse.status === 200 && (await signedResponse.text()) === "feed-private-final-proof",
      "FEED_REAL_SIGNED_FINAL_GET");
    check((await fetch(`http://127.0.0.1:9000/${feedConfig.bucket}/${finalKey}`)).status === 403,
      "FEED_ANONYMOUS_FINAL_DENIED");
    await s3.send(new DeleteObjectCommand({Bucket:feedConfig.bucket,Key:finalKey}));
    ownObjects.pop();
    console.log("PASS: feed presigned POST HEAD GET DELETE + signed final GET / anonymous 403");
    console.log("NONPROD_REAL_S3_ACCEPTANCE_ALL_PASSED; no secrets, production, API or SQL touched");
  } finally {
    for (const {bucket,key} of ownObjects.reverse()) {
      try { await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key})); }
      catch { console.error("S3_CLEANUP_FAILED_SCOPE_OBJECT"); }
    }
    s3.destroy();
  }
}
void main().catch((error: unknown) => {
  console.error("NONPROD_REAL_S3_ACCEPTANCE_FAILED", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});
