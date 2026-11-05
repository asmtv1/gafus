import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const picker = readFileSync(new URL("./ui.tsx", import.meta.url), "utf8");
const form = readFileSync(new URL("./QuestionFormScreen.tsx", import.meta.url), "utf8");
const answer = readFileSync(new URL("./QuestionDetailScreen.tsx", import.meta.url), "utf8");
const prepare = picker.slice(picker.indexOf("async function uploadOne("),
  picker.indexOf("async function retryOne("));
const flush = picker.slice(picker.indexOf("async function flushDraftUploads("),
  picker.indexOf("const pick = async () =>"));

describe("Questions and answers: S3 only after publishing", () => {
  it("prepares both WebP renditions locally, no S3 reservation on selection", () => {
    expect(prepare).toContain("prepareUploadPhoto(asset)");
    expect(prepare).toContain("prepareUploadWebpVariants(prepared, { small: 360, medium: 1440 })");
    expect(prepare).toContain("const localId = `local-${Crypto.randomUUID()}`");
    expect(prepare).toContain('uploaded = { id: localId, url: asset.uri, status: "READY" }');
    expect(prepare).toContain("if (submitUploadsRef)");
  });
  it("uploads only on explicit submit, caches successes and preserves other photo drafts", () => {
    expect(flush).toContain("const completed = uploadedDrafts.current.get(photo.id)");
    expect(flush).toContain("const uploaded = await uploadClientQuestionsPhoto({");
    expect(flush).toContain("uploadedDrafts.current.set(photo.id, confirmed)");
    expect(flush).toContain("photosRef.current = ready");
    expect(flush).toContain("onChange(ready)");
  });
  it("question and answer buttons register the deferred upload callback before mutations", () => {
    expect(form).toContain("submitUploadsRef={photoSubmitRef}");
    expect(answer).toContain("submitUploadsRef={photoSubmitRef}");
    const formSubmit = form.slice(form.indexOf("const submit = async () =>"),
      form.indexOf("return (", form.indexOf("const submit = async () =>")));
    expect(formSubmit.indexOf("await photoSubmitRef.current()")).toBeLessThan(
      formSubmit.indexOf("await questionsApi.edit("));
    const answerSubmit = answer.slice(answer.indexOf("const submitAnswer = async () =>"),
      answer.indexOf("const confirmDelete", answer.indexOf("const submitAnswer = async () =>")));
    expect(answerSubmit.indexOf("await photoSubmitRef.current()")).toBeLessThan(
      answerSubmit.indexOf("await questionsApi.answer("));
    expect(answerSubmit).toContain("return;");
  });
  it("releases the local draft on removal/cancel without making S3 calls", () => {
    expect(picker).toContain('if (p.id.startsWith("local-"))');
    expect(picker).toContain("for (const item of Object.values(variants)) item.dispose()");
    expect(answer).toContain("setPhotos([])");
  });
});
