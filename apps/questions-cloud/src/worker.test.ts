import {beforeEach, describe, expect, it, vi} from "vitest";
import sharp from "sharp";
import { createHash } from "node:crypto";
import {createQuestionsCloudProcessor} from "./worker";
import {convertQuestionImage} from "./sharp-engine";
import {questionPaths} from "./keys";

const source = "questions/incoming/questions/owner/id-123/source.png";
const marker = "questions/jobs/pending/questions/owner/id-123/source.png";
const sourceData = await sharp({create: {width:800,height:600,channels:4,background: {r:24,g:135,b:55,alpha:1}}}).png().toBuffer();
const content = new Map<string, {bytes: Buffer; type:string}>();
const realSend = vi.fn(async (command: {input:Record<string, unknown>; constructor:{name:string}}) => {
  const {input} = command, key=String(input.Key ?? "");
  const error = () => Object.assign(new Error("Missing"), {$metadata:{httpStatusCode:404}});
  if (command.constructor.name === "ListObjectsV2Command")
    return {Contents:[...content.keys()].filter(k => k.startsWith(String(input.Prefix ?? ""))).map(Key => ({Key,LastModified:new Date()})), IsTruncated:false};
  if (command.constructor.name === "HeadObjectCommand") {
    const object=content.get(key);
    if (!object) throw error();
    return {ContentType:object.type,ContentLength:object.bytes.length,
      ETag: '"' + createHash("md5").update(object.bytes).digest("hex") + '"'};
  }
  if (command.constructor.name === "GetObjectCommand") {
    const object=content.get(key);
    if (!object) throw error();
    return {ContentLength:object.bytes.length,Body: (async function*(){yield object.bytes;})()};
  }
  if (command.constructor.name === "DeleteObjectCommand") {
    content.delete(key);
    return {};
  }
  if (command.constructor.name === "PutObjectCommand") {
    if (input.IfNoneMatch === "*" && content.has(key))
      throw Object.assign(new Error("Precondition Failed"),{$metadata:{httpStatusCode:412}});
    content.set(key,{bytes:Buffer.from(input.Body as Uint8Array),type:String(input.ContentType)});
    return {};
  }
  throw Error("UNEXPECTED_COMMAND_"+command.constructor.name);
});
const processor=()=>createQuestionsCloudProcessor({send:realSend} as never);
beforeEach(() => {content.clear(); realSend.mockClear();
  content.set(source,{bytes:sourceData,type:"image/png"});
  content.set(marker,{bytes:Buffer.from([1]),type:"application/octet-stream"});
});

describe("isolated Questions Cloud.ru Job", () => {
  it("only produces two private WebP variants; does not publish to CDN", async () => {
    expect(await processor().run()).toEqual({scanned:1,processed:1,rejected:0,legacyScanned:0});
    const path = questionPaths(source);
    const a=content.get(path.stageThumb)!, b=content.get(path.stageFull)!;
    for (const item of [a,b]) {
      const m=await sharp(item.bytes).metadata();
      expect(m.format).toBe("webp");
      expect(m.exif).toBeUndefined();
      expect(item.type).toBe("image/webp");
    }
    expect((await sharp(a.bytes).metadata()).width).toBeLessThanOrEqual(480);
    expect((await sharp(b.bytes).metadata()).width).toBeLessThanOrEqual(1920);
    expect(content.has(path.finalFull)).toBe(false);
    expect(content.has(path.finalThumb)).toBe(false);
  });
  it("uses ONLY the work-record prefix on regular invocations, and acknowledges completion", async () => {
    const result = await processor().run(5);
    expect(result).toMatchObject({scanned: 1, processed: 1, legacyScanned: 0});
    const scans = realSend.mock.calls.filter(([c]) => c.constructor.name === "ListObjectsV2Command")
      .map(([c]) => c.input.Prefix);
    expect(scans).toEqual(["questions/jobs/pending/questions/",
      "questions/processed/questions/owner/id-123/"]);
    expect(content.has(marker)).toBe(false);
    expect(content.has(source)).toBe(true);
    expect(content.has(questionPaths(source).stageFull)).toBe(true);
  });
  it("preserves unacknowledged work on an S3 failure for next cron retry", async () => {
    const original = realSend.getMockImplementation()!;
    let once = true;
    realSend.mockImplementation(async command => {
      if (command.constructor.name === "GetObjectCommand" && command.input.Key === source && once) {
        once = false;
        throw new Error("S3_DOWN");
      }
      return original(command);
    });
    await expect(processor().run()).rejects.toThrow("S3_DOWN");
    expect(content.has(marker)).toBe(true);
    expect(await processor().run()).toMatchObject({processed: 1});
    expect(content.has(marker)).toBe(false);
  });
  it("recovers unindexed original sources only in explicit recovery mode", async () => {
    content.delete(marker);
    expect(await processor().run()).toMatchObject({scanned: 0, processed: 0, legacyScanned: 0});
    expect(await processor().run(5, {recovery: true})).toMatchObject({
      scanned: 0, processed: 1, legacyScanned: 1,
    });
    expect(content.has(questionPaths(source).stageThumb)).toBe(true);
  });
  it("clears aged orphan work records when source was canceled, without touching public files", async () => {
    content.delete(source);
    const original = realSend.getMockImplementation()!;
    realSend.mockImplementation(async command => {
      if (command.constructor.name === "ListObjectsV2Command" &&
          String(command.input.Prefix).startsWith("questions/jobs/pending/")) {
        return {Contents:[{Key:marker,LastModified:new Date(Date.now()-300_000)}],IsTruncated:false};
      }
      return original(command);
    });
    expect(await processor().run()).toMatchObject({scanned:1,processed:0,rejected:0});
    expect(content.has(marker)).toBe(false);
    expect(content.has(questionPaths(source).finalFull)).toBe(false);
    realSend.mockImplementation(original);
  });
  it("retains fresh work records after missing-source 404 for later retry", async () => {
    content.delete(source);
    await expect(processor().run()).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
    expect(content.has(marker)).toBe(true);
  });
  it("ignores unsafe work-marker names without fetching foreign originals", async () => {
    content.delete(marker);
    content.set("questions/jobs/pending/questions/../bad/source.png", {
      bytes: Buffer.from([1]),type: "application/octet-stream",
    });
    expect(await processor().run()).toMatchObject({scanned: 0, processed: 0});
    expect(realSend.mock.calls.filter(([c]) => c.constructor.name === "GetObjectCommand")).toHaveLength(0);
  });
  it("auto-orients portrait JPEG and strips private metadata", async () => {
    const tilted=await sharp({create:{width:640,height:360,channels:3,background:"#333333"}})
      .jpeg().withMetadata({orientation:6}).toBuffer();
    const converted=await convertQuestionImage(tilted);
    for(const output of [converted.thumb, converted.full]) {
      const meta=await sharp(output.bytes).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBeLessThan(meta.height!);
      expect(meta.orientation).toBeUndefined();
      expect(meta.exif).toBeUndefined();
    }
  });
  it("skips immutable results under repeated delivery", async () => {
    await processor().process(source);
    realSend.mockClear();
    expect(await processor().process(source)).toBe("already");
    expect(realSend.mock.calls.filter(([c]) => c.constructor.name === "HeadObjectCommand")).toHaveLength(0);
    expect(realSend.mock.calls.filter(([c]) => c.constructor.name === "ListObjectsV2Command")).toHaveLength(1);
    expect(realSend.mock.calls.filter(([c]) => c.constructor.name === "GetObjectCommand")).toHaveLength(0);
  });
  it("retries partial WebP uploads immutably without losing the completed variant", async () => {
    const paths = questionPaths(source);
    const original = realSend.getMockImplementation()!;
    let failOnce = true;
    realSend.mockImplementation(async command => {
      if (command.constructor.name === "PutObjectCommand" &&
          command.input.Key === paths.stageFull && failOnce) {
        failOnce = false;
        throw new Error("NETWORK");
      }
      return original(command);
    });
    await expect(processor().process(source)).rejects.toThrow("NETWORK");
    expect(content.has(paths.stageThumb)).toBe(true);
    expect(content.has(paths.stageFull)).toBe(false);
    expect(await processor().process(source)).toBe("processed");
    expect(content.has(paths.stageFull)).toBe(true);
    expect(content.has(paths.finalFull)).toBe(false);
    realSend.mockImplementation(original);
  });
  it("rejects a conflicting immutable WebP instead of silently accepting 412", async () => {
    const keys = questionPaths(source);
    content.set(keys.stageThumb, {bytes: Buffer.from("not-our-webp"), type: "image/webp"});
    await expect(processor().process(source)).rejects.toThrow("QUESTIONS_IMMUTABLE_CONFLICT");
    expect(content.has(keys.finalThumb)).toBe(false);
    expect(content.has(keys.finalFull)).toBe(false);
  });
  it("never publishes tampered traversal keys", async () => {
    for(const invalid of [
      "questions/incoming/questions/../id/source.png",
      "questions/incoming/questions/owner/id/source.svg",
      "questions/incoming/questions/owner/id/source.png?q=1",
    ]) await expect(processor().process(invalid)).rejects.toThrow("QUESTIONS_UNTRUSTED_SOURCE");
  });
  it("marks invalid images with a private failure result", async () => {
    content.set(source,{bytes:Buffer.from("not-an-image"),type:"image/png"});
    expect(await processor().process(source)).toBe("rejected");
    const path=questionPaths(source);
    expect(content.get(path.stageFailed)?.type).toBe("application/json");
    expect(content.has(path.finalFull)).toBe(false);
  });
  it("bounds image pixels and validates still image", async () => {
    await expect(convertQuestionImage(new Uint8Array([1,2,3]))).rejects.toThrow("INVALID_IMAGE");
    const gif=await sharp({create:{width:4,height:4,channels:3,background:"red"}}).gif().toBuffer();
    await expect(convertQuestionImage(gif)).rejects.toThrow("IMAGE_FORMAT");
  });
});
