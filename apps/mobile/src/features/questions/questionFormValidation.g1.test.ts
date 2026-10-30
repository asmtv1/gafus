import { describe, expect, it } from "vitest";
import { validateQuestionDraft } from "./questionFormValidation";
const valid = () => ({
  title: "  Как научить собаку ждать?  ",
  body: "  Нужна помощь с выдержкой.  ",
  category: "Поведение" as const,
  tags: "  #щенок , поводок , щенок ",
  photoIds: ["photo1"],
});
describe("AG3 existing question form source-only input limits", () => {
  it("trims server-owned fields and canonicalizes tags without a different DTO", () => {
    expect(validateQuestionDraft(valid())).toEqual({
      ok: true,
      input: {
        title: "Как научить собаку ждать?",
        body: "Нужна помощь с выдержкой.",
        category: "Поведение",
        tags: ["щенок", "поводок"],
        photoIds: ["photo1"],
      },
    });
  });
  it("rejects blank title and body before POST", () => {
    expect(validateQuestionDraft({ ...valid(), title: "   " })).toMatchObject({
      ok: false,
      message: "Напишите заголовок",
    });
    expect(validateQuestionDraft({ ...valid(), body: "  " })).toMatchObject({
      ok: false,
      message: "Напишите текст",
    });
  });
  it("rejects server max title/body lengths", () => {
    expect(validateQuestionDraft({ ...valid(), title: "t".repeat(151) })).toMatchObject({
      ok: false,
    });
    expect(validateQuestionDraft({ ...valid(), body: "b".repeat(10001) })).toMatchObject({
      ok: false,
    });
  });
  it("rejects six tags even if duplicates, matching server pre-transform max", () => {
    expect(validateQuestionDraft({ ...valid(), tags: "a,b,c,d,e,a" })).toEqual({
      ok: false,
      message: "Можно добавить до 5 тегов",
    });
  });
  it("rejects tag longer than 32 after removing leading hashes", () => {
    expect(validateQuestionDraft({ ...valid(), tags: "#" + "a".repeat(33) })).toMatchObject({
      ok: false,
    });
  });
  it("rejects duplicated, malformed and overlimit photo ids", () => {
    expect(validateQuestionDraft({ ...valid(), photoIds: ["a", "a"] })).toMatchObject({
      ok: false,
    });
    expect(validateQuestionDraft({ ...valid(), photoIds: [""] })).toMatchObject({ ok: false });
    expect(
      validateQuestionDraft({
        ...valid(),
        photoIds: Array.from({ length: 6 }, (_, i) => String(i)),
      }),
    ).toMatchObject({ ok: false });
  });
});
