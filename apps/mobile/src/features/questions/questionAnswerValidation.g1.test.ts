import { describe, expect, it } from "vitest";
import { validateQuestionAnswerDraft } from "./questionAnswerValidation";
const valid = () => ({
  body: "  Советую начать с коротких прогулок.  ",
  photoIds: ["photo-1"],
  replyToId: "answer-1",
});
describe("AG3 SOC032 actual answer composer precommit limits", () => {
  it("trims body without changing existing answer input shape", () => {
    expect(validateQuestionAnswerDraft(valid())).toEqual({
      ok: true,
      input: {
        body: "Советую начать с коротких прогулок.",
        photoIds: ["photo-1"],
        replyToId: "answer-1",
      },
    });
  });
  it("rejects blank and >10000 body", () => {
    expect(validateQuestionAnswerDraft({ ...valid(), body: "   " })).toEqual({
      ok: false,
      message: "Напишите текст",
    });
    expect(validateQuestionAnswerDraft({ ...valid(), body: "x".repeat(10001) })).toMatchObject({
      ok: false,
    });
  });
  it("rejects six, repeated, empty and overly long photo ids", () => {
    expect(
      validateQuestionAnswerDraft({
        ...valid(),
        photoIds: Array.from({ length: 6 }, (_, i) => String(i)),
      }),
    ).toMatchObject({ ok: false });
    expect(validateQuestionAnswerDraft({ ...valid(), photoIds: ["x", "x"] })).toMatchObject({
      ok: false,
    });
    expect(validateQuestionAnswerDraft({ ...valid(), photoIds: [""] })).toMatchObject({
      ok: false,
    });
    expect(validateQuestionAnswerDraft({ ...valid(), photoIds: ["x".repeat(129)] })).toMatchObject({
      ok: false,
    });
  });
  it("checks parent reply id and excludes absent replyToId", () => {
    expect(validateQuestionAnswerDraft({ ...valid(), replyToId: "x".repeat(129) })).toMatchObject({
      ok: false,
    });
    expect(validateQuestionAnswerDraft({ ...valid(), replyToId: undefined })).toEqual({
      ok: true,
      input: { body: "Советую начать с коротких прогулок.", photoIds: ["photo-1"] },
    });
  });
});
