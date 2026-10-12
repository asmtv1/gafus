/** Actual headless Chrome CORS acceptance for disposable private Cloud.ru objects only. */
import puppeteer from "puppeteer";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const e = process.env;
if (
  e.GAFUS_REAL_BROWSER_CORS_CONFIRM !== "synthetic-s3-no-prod-writes" ||
  e.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru" ||
  !e.CLOUDRU_S3_ACCESS_KEY_ID ||
  !e.CLOUDRU_S3_SECRET_ACCESS_KEY
)
  throw Error("BROWSER_CORS_TEST_NOT_AUTHORIZED");
const client = new S3Client({
  endpoint: "https://s3.cloud.ru",
  region: "ru-central-1",
  forcePathStyle: true,
  maxAttempts: 1,
  credentials: {
    accessKeyId: e.CLOUDRU_S3_ACCESS_KEY_ID,
    secretAccessKey: e.CLOUDRU_S3_SECRET_ACCESS_KEY,
  },
});
const site = "https://gafus.ru",
  buckets = ["gafus-gallery-private", "gafus-feed-private", "gafus-documents-private"];
let browser;
let passed = true;
const uploaded = [];
try {
  browser = await puppeteer.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  const page = await browser.newPage();
  const navigation = await page.goto(site, { waitUntil: "domcontentloaded", timeout: 25000 });
  if (!navigation || navigation.status() >= 400 || new URL(page.url()).origin !== site)
    throw Error("BROWSER_NOT_ON_TRUSTED_SITE");
  for (const bucket of buckets) {
    const key = "__gafus_cloudru_validation__/browser-" + randomUUID() + ".txt";
    const bytes = Buffer.from("gafus-browser-" + randomUUID());
    let created = false;
    let post = false;
    if (bucket !== "gafus-documents-private") {
      const signed = await createPresignedPost(client, {
        Bucket: bucket,
        Key: key,
        Expires: 90,
        Fields: { "Content-Type": "text/plain", success_action_status: "204" },
        Conditions: [
          ["content-length-range", 1, 512],
          ["eq", "$Content-Type", "text/plain"],
          ["eq", "$key", key],
          ["eq", "$success_action_status", "204"],
        ],
      });
      const outcome = await page.evaluate(
        async ({ url, fields, bytes }) => {
          const body = new FormData();
          for (const [k, v] of Object.entries(fields)) body.append(k, v);
          body.append(
            "file",
            new Blob([new Uint8Array(bytes)], { type: "text/plain" }),
            "browser.txt",
          );
          try {
            const r = await fetch(url, { method: "POST", body, mode: "cors", redirect: "manual" });
            return { status: r.status, readable: r.type !== "opaque" };
          } catch (ex) {
            return { status: 0, reason: ex?.name ?? "unknown" };
          }
        },
        { url: signed.url, fields: signed.fields, bytes: [...bytes] },
      );
      post = outcome.status === 204 || outcome.status === 200;
      created = post;
      console.log(
        JSON.stringify({ bucket, realBrowserPresignedPost: post, status: outcome.status }),
      );
    } else {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: "text/plain",
          IfNoneMatch: "*",
        }),
      );
      created = true;
    }
    if (created) uploaded.push({ bucket, key });
    if (!created) {
      passed = false;
      continue;
    }
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: 90,
    });
    const outcome = await page.evaluate(async (url) => {
      try {
        const r = await fetch(url, { mode: "cors" });
        const data = new Uint8Array(await r.arrayBuffer());
        return { status: r.status, bytes: [...data] };
      } catch (ex) {
        return { status: 0, reason: ex?.name ?? "unknown" };
      }
    }, url);
    const get = outcome.status === 200 && Buffer.from(outcome.bytes ?? []).equals(bytes);
    console.log(JSON.stringify({ bucket, realBrowserPresignedGet: get, status: outcome.status }));
    if (!get) passed = false;
  }
} catch (ex) {
  console.log(JSON.stringify({ browserSmokeError: ex?.message?.slice(0, 60) ?? "unknown" }));
  passed = false;
} finally {
  for (const { bucket, key } of uploaded) {
    let removed = false;
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      } catch (ex) {
        removed = ex?.$metadata?.httpStatusCode === 404;
      }
    } catch {}
    console.log(JSON.stringify({ bucket, syntheticDeleted: removed }));
    if (!removed) passed = false;
  }
  if (browser) await browser.close();
  client.destroy();
}
console.log("ACTUAL_CHROME_CORS_SMOKE=" + (passed ? "PASS" : "FAIL"));
if (!passed) process.exitCode = 1;
