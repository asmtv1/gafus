import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { createQuestionsCloudProcessor, QUESTION_JOB_BUCKET } from "./worker.js";
import { questionPaths } from "./keys.js";

const source = "questions/incoming/questions/local-owner/photo-123/source.png";
const work = "questions/jobs/pending/questions/local-owner/photo-123/source.png";
const objectUrlPrefix = "/" + QUESTION_JOB_BUCKET + "/";
type Entry = { bytes: Buffer; type: string; created: Date; etag: string };
const entries = new Map<string, Entry>();
let server: ReturnType<typeof createServer> | undefined;
let client: S3Client | undefined;
let failSourceOnce = false;

function respond(response: ServerResponse, status: number, data = "", headers: Record<string, string> = {}) {
  response.writeHead(status, { "content-type": "application/xml", ...headers });
  response.end(data);
}
async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (!url.pathname.startsWith(objectUrlPrefix)) return respond(res, 404);
  const key = decodeURIComponent(url.pathname.slice(objectUrlPrefix.length));
  if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
    const prefix = url.searchParams.get("prefix") ?? "";
    const max = Math.min(1000, Math.max(1, Number(url.searchParams.get("max-keys") ?? 1000)));
    const filtered = [...entries].filter(([k]) => k.startsWith(prefix))
      .sort(([a],[b]) => a.localeCompare(b)).slice(0,max);
    const esc = (v: string) => v.replaceAll("&","&amp;").replaceAll("<","&lt;");
    return respond(res, 200,
      '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
      filtered.map(([k,v]) => '<Contents><Key>' + esc(k) + '</Key><LastModified>' +
        v.created.toISOString() + '</LastModified><Size>' + v.bytes.length +
        '</Size></Contents>').join("") + '<IsTruncated>false</IsTruncated></ListBucketResult>');
  }
  if (req.method === "PUT") {
    if (req.headers["if-none-match"] === "*" && entries.has(key))
      return respond(res, 412, '<Error><Code>PreconditionFailed</Code></Error>');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const etag = '"' + createHash("md5").update(bytes).digest("hex") + '"';
    entries.set(key, { bytes, etag, type: req.headers["content-type"] ?? "binary/octet-stream",
      created: new Date() });
    return respond(res, 200, "", {etag});
  }
  if (req.method === "GET" && key === source && failSourceOnce) {
    failSourceOnce = false;
    return respond(res, 503, '<Error><Code>ServiceUnavailable</Code></Error>');
  }
  if (req.method === "DELETE") { entries.delete(key); return respond(res, 204); }
  const entry = entries.get(key);
  if (!entry) return respond(res, 404, '<Error><Code>NoSuchKey</Code></Error>');
  if (req.method === "HEAD" || req.method === "GET") {
    res.writeHead(200, {"content-type": entry.type, "content-length": entry.bytes.length, etag: entry.etag,
      "last-modified": entry.created.toUTCString()});
    return res.end(req.method === "HEAD" ? undefined : entry.bytes);
  }
  return respond(res, 405);
}
async function setup() {
  entries.clear();
  failSourceOnce = false;
  server = createServer((req,res) => { void handle(req,res).catch(() => res.destroy()); });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as {port: number}).port;
  client = new S3Client({
    endpoint: "http://127.0.0.1:" + port, region: "ru-central-1",
    forcePathStyle: true, maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {accessKeyId: "isolated-test", secretAccessKey: "test-only"},
  });
  const fixture = await sharp({create: {width: 640,height:480,channels:3,
    background: {r:90,g:120,b:40}}}).png().toBuffer();
  await client.send(new PutObjectCommand({Bucket:QUESTION_JOB_BUCKET,Key:source,
    Body:fixture,ContentLength:fixture.length,ContentType:"image/png",IfNoneMatch:"*"}));
  await client.send(new PutObjectCommand({Bucket:QUESTION_JOB_BUCKET,Key:work,
    Body:Buffer.from([1]),ContentLength:1,ContentType:"application/octet-stream",IfNoneMatch:"*"}));
}
afterEach(async () => {
  client?.destroy();
  if (server) await new Promise<void>((resolve,reject) =>
    server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  client = undefined;
  entries.clear();
});

describe("Questions end-to-end isolated HTTP S3 protocol", () => {
  it("consumes exact work marker, generates private WebP, and acknowledges marker", async () => {
    await setup();
    const results = await createQuestionsCloudProcessor(client!).run(5);
    expect(results).toMatchObject({scanned:1,processed:1,rejected:0,legacyScanned:0});
    expect(entries.has(work)).toBe(false);
    expect(entries.has(source)).toBe(true);
    const paths=questionPaths(source);
    for (const key of [paths.stageThumb, paths.stageFull]) {
      const read=await client!.send(new GetObjectCommand({Bucket:QUESTION_JOB_BUCKET,Key:key}));
      const bytes=Buffer.from(await read.Body!.transformToByteArray());
      expect((await sharp(bytes).metadata()).format).toBe("webp");
      expect(read.ContentType).toBe("image/webp");
    }
    expect(entries.has(paths.finalFull)).toBe(false);
    expect(entries.has(paths.finalThumb)).toBe(false);
    const head=await client!.send(new HeadObjectCommand({Bucket:QUESTION_JOB_BUCKET,Key:paths.stageThumb}));
    expect(head.ContentLength).toBeGreaterThan(0);
  });
  it("keeps durable marker on transient S3 error, then retries successfully", async () => {
    await setup();
    failSourceOnce = true;
    const processor = createQuestionsCloudProcessor(client!);
    await expect(processor.run(5)).rejects.toThrow();
    expect(entries.has(work)).toBe(true);
    expect(await processor.run(5)).toMatchObject({processed:1});
    expect(entries.has(work)).toBe(false);
  });
});
