import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("all four mobile photo upload paths share the pre-S3 optimizer", () => {
  it("Moments optimizes photos while passing videos unchanged and signs the compressed metadata", () => {
    const src = read("../../../features/feed/uploads.ts");
    expect(src).toContain("type.kind === \"photo\" ? await prepareUploadPhoto(asset) : null");
    expect(src).toContain("declaredMime: item.mime");
    expect(src).toContain("declaredBytes: item.bytes");
    expect(src).toContain("releaseFeedPickedMedia(item)");
    expect(src).not.toContain('process.env.EXPO_PUBLIC_CLIENT_PHOTO_PROCESSING');
    expect(src).toContain('await prepareUploadWebpVariants(prepared,');
    expect(src).toContain("type.kind === \"video\" ? await makeFeedVideoPoster(asset.uri) : undefined");
  });
  it("Chat2 optimizes only image attachments, retains original as preview, and disposes temp bytes", () => {
    const src = read("../../../features/chat2/Chat2RoomScreen.tsx");
    expect(src).toContain("if (kind === \"image\") {");
    expect(src).toContain("prepared = await prepareUploadPhoto(source);");
    expect(src).toContain("uri:f.uri, sourcePhoto:f, uploading:true");
    expect(src).toContain("prepared?.dispose();");
    expect(src).toContain("size: prepared.bytes");
  });
  it("Chat2 and Questions keep 360px thumbnails and send 1440px WebP originals", () => {
    const chat = read("../../../features/chat2/api.ts");
    const questions = read("../api/questions.ts");
    for (const source of [chat, questions]) {
      expect(source).toContain("{ small: 360, medium: 1440 }");
      expect(source).not.toContain("{ small: 360, medium: 720 }");
    }
  });
  it("Gallery optimizes before reserving the S3 POST and disposes the temporary photo", () => {
    const src = read("../../../features/gallery/uploads.tsx");
    expect(src).toContain("const prepared = await prepareUploadPhoto(asset);");
    expect(src).toContain("declaredBytes: clientVersions?.full.bytes ?? prepared.file.size");
    expect(src).toContain("if (prepared.temporary) prepared.file.delete();");
  });
  it("Questions sends client-rendered WebP to S3 while retaining original URI for preview", () => {
    const src = read("../../../features/questions/ui.tsx");
    expect(src).toContain("classifyQuestionNativePhoto(asset);");
    expect(src).toContain("prepared = await prepareUploadPhoto(asset);");
    expect(src).toContain("uploadClientQuestionsPhoto(prepared,p => setProgress(p))");
    expect(src).toContain("const next=[...photosRef.current,{...uploaded,url:asset.uri}]");
    expect(src).toContain("prepared?.dispose();");
  });
});
