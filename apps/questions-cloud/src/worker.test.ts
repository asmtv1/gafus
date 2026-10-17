import {beforeEach, describe, expect, it, vi} from "vitest";
import sharp from "sharp";
import {createQuestionsCloudProcessor} from "./worker";
import {convertQuestionImage} from "./sharp-engine";
import {questionPaths} from "./keys";

const source = "questions/incoming/questions/owner/id-123/source.png";
const sourceData = await sharp({create: {width:800,height:600,channels:4,background: {r:24,g:135,b:55,alpha:1}}}).png().toBuffer();
const content = new Map<string, {bytes: Buffer; type:string}>();
const realSend = vi.fn(async (command: {input:Record<string, unknown>; constructor:{name:string}}) => {
  const {input} = command, key=String(input.Key ?? "");
  const error = () => Object.assign(new Error("Missing"), {$metadata:{httpStatusCode:404}});
  if (command.constructor.name === "ListObjectsV2Command")
    return {Contents:[{Key:source}], IsTruncated:false};
  if (command.constructor.name === "HeadObjectCommand") {
    const object=content.get(key);
    if (!object) throw error();
    return {ContentType:object.type,ContentLength:object.bytes.length};
  }
  if (command.constructor.name === "GetObjectCommand") {
    const object=content.get(key);
    if (!object) throw error();
    return {ContentLength:object.bytes.length,Body: (async function*(){yield object.bytes})()};
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
beforeEach(() => {content.clear(); realSend.mockClear();content.set(source,{bytes:sourceData,type:"image/png"});});

describe("isolated Questions Cloud.ru Job", () => {
  it("only produces two private WebP variants; does not publish to CDN", async () => {
    expect(await processor().run()).toEqual({scanned:1,processed:1,rejected:0});
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
    expect(await processor().process(source)).toBe("already");
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
