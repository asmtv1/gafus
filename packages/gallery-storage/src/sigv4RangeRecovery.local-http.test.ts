/**
 * Disposable loopback protocol acceptance with genuine AWS SDK SigV4 signing.
 * This deliberately is NOT a MinIO/S3 server or a worker end-to-end test:
 * verification/storage are independent synthetic HTTP fixtures. No .env,
 * production credentials, S3 buckets, persistent files or fixed ports.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accessKey = "gafus-disposable-loopback-key";
const secretKey = "gafus-disposable-loopback-secret-000000";
const bucket = "gafus-synthetic-private";
const objectKey = "albums/test/photos/private.webp";
const body = Buffer.from("0123456789abcdef", "ascii");
const hexSha256 = (data: string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

function authenticated(url: URL, method: string, checkedAt: number): boolean {
  const query = url.searchParams;
  const amzDate = query.get("X-Amz-Date");
  const credential = query.get("X-Amz-Credential")?.split("/");
  const signature = query.get("X-Amz-Signature");
  const ttl = Number(query.get("X-Amz-Expires"));
  if (!amzDate || !credential || !signature || credential.length !== 5 ||
      credential[0] !== accessKey || credential[2] !== "us-east-1" ||
      credential[3] !== "s3" || credential[4] !== "aws4_request" ||
      query.get("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256" ||
      query.get("X-Amz-SignedHeaders") !== "host" ||
      !Number.isInteger(ttl) || ttl <= 0 || ttl > 360 ||
      !/^\d{8}T\d{6}Z$/.test(amzDate)) return false;
  const issuedAt = Date.UTC(Number(amzDate.slice(0, 4)), Number(amzDate.slice(4, 6))-1,
    Number(amzDate.slice(6, 8)), Number(amzDate.slice(9, 11)),
    Number(amzDate.slice(11, 13)), Number(amzDate.slice(13, 15)));
  if (checkedAt < issuedAt - 15_000 || checkedAt >= issuedAt + ttl * 1000) return false;
  const canonicalQuery = [...query.entries()]
    .filter(([name]) => name !== "X-Amz-Signature")
    .map(([name, value]) => [encode(name), encode(value)] as const)
    .sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`).join("&");
  const canonical = [method, url.pathname, canonicalQuery,
    `host:${url.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const scope = credential.slice(1).join("/");
  const signed = ["AWS4-HMAC-SHA256", amzDate, scope, hexSha256(canonical)].join("\n");
  const dateKey = hmac(`AWS4${secretKey}`, credential[1]!);
  const regionKey = hmac(dateKey, "us-east-1");
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const expected = hmac(signingKey, signed);
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

let server: Server;
let client: S3Client;
let origin = "";
let timeOffsetMs = 0;
let storageStatus = 200;
let objectDeleted = false;
const sign = (seconds = 90) => getSignedUrl(client,
  new GetObjectCommand({ Bucket: bucket, Key: objectKey, ResponseCacheControl: "private, no-store" }),
  { expiresIn: seconds });
const signHead = (seconds = 90) => getSignedUrl(client,
  new HeadObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn: seconds });

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const deny = (code: number) => { res.writeHead(code, { "Cache-Control": "private, no-store" }); res.end(); };
    if ((req.method !== "GET" && req.method !== "HEAD") ||
        url.pathname !== `/${bucket}/${objectKey}` ||
        !authenticated(url, req.method, Date.now() + timeOffsetMs)) return deny(403);
    if (storageStatus !== 200) return deny(storageStatus);
    if (objectDeleted) return deny(410);
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
    if (req.headers.range && !match) return deny(416);
    const first = match ? Number(match[1]) : 0;
    const last = match
      ? Math.min(match[2] ? Number(match[2]) : body.length - 1, body.length - 1)
      : body.length - 1;
    if (first >= body.length || last < first) {
      res.writeHead(416, { "Content-Range": `bytes */${body.length}`, "Cache-Control": "private, no-store" });
      return res.end();
    }
    const bytes = body.subarray(first, last + 1);
    res.writeHead(match ? 206 : 200, {
      "Content-Length": bytes.length, "Accept-Ranges": "bytes",
      ...(match ? { "Content-Range": `bytes ${first}-${last}/${body.length}` } : {}),
      "Cache-Control": "private, no-store",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("LOOPBACK_LISTENER_REQUIRED");
  origin = `http://127.0.0.1:${address.port}`;
  client = new S3Client({ endpoint: origin, region: "us-east-1", forcePathStyle: true,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey }, maxAttempts: 1 });
});
afterAll(async () => {
  client?.destroy();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => { timeOffsetMs = 0; storageStatus = 200; objectDeleted = false; });

describe("signed private Range delivery over disposable localhost HTTP (not MinIO)", () => {
  it("independently verifies AWS SigV4 and returns exact private 206/416/200", async () => {
    const url = await sign();
    const partial = await fetch(url, { headers: { Range: "bytes=4-7" } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 4-7/16");
    expect(partial.headers.get("cache-control")).toBe("private, no-store");
    expect(await partial.text()).toBe("4567");
    const invalid = await fetch(url, { headers: { Range: "bytes=100-" } });
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toBe("bytes */16");
    const full = await fetch(url);
    expect(full.status).toBe(200);
    expect(await full.text()).toBe(body.toString());
  });
  it("verifies independently signed HEAD metadata and rejects expired HEAD grants", async () => {
    const url = await signHead(10);
    const head = await fetch(url, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("16");
    expect(head.headers.get("accept-ranges")).toBe("bytes");
    expect(head.headers.get("cache-control")).toBe("private, no-store");
    expect(await head.text()).toBe("");
    timeOffsetMs = 11_000;
    expect((await fetch(url, { method: "HEAD" })).status).toBe(403);
  });
  it("rejects unsigned requests, changed storage keys, tampered response policy and expired signatures", async () => {
    const url = await sign(10);
    expect((await fetch(`${origin}/${bucket}/${objectKey}`)).status).toBe(403);
    expect((await fetch(url.replace(objectKey, `${objectKey}-other`))).status).toBe(403);
    const altered = new URL(url); altered.searchParams.set("response-cache-control", "public");
    expect((await fetch(altered)).status).toBe(403);
    timeOffsetMs = 11_000;
    expect((await fetch(url)).status).toBe(403);
  });
  it("storage 503 never grants public access; recovery restores signed Range bytes", async () => {
    const url = await sign(); storageStatus = 503;
    const unavailable = await fetch(url, { headers: { Range: "bytes=0-3" } });
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("cache-control")).toBe("private, no-store");
    storageStatus = 200;
    const recovered = await fetch(url, { headers: { Range: "bytes=0-3" } });
    expect(recovered.status).toBe(206);
    expect(await recovered.text()).toBe("0123");
  });
  it("invalidation returns 410 for still-signed key, never stale object bytes", async () => {
    const url = await sign(); objectDeleted = true;
    const response = await fetch(url);
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
