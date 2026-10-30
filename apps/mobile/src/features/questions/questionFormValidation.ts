import { QUESTION_LIMITS, type QuestionCategory } from "@gafus/types";

type Draft = {
  title: string;
  body: string;
  category: QuestionCategory;
  tags: string;
  photoIds: string[];
};
type Checked =
  | {
      ok: true;
      input: {
        title: string;
        body: string;
        category: QuestionCategory;
        tags: string[];
        photoIds: string[];
      };
    }
  | { ok: false; message: string };

/** Mirror only the existing precommit limits: no network or alternate DTO. */
export function validateQuestionDraft(draft: Draft): Checked {
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (!title) return { ok: false, message: "Напишите заголовок" };
  if (title.length > QUESTION_LIMITS.title)
    return { ok: false, message: "Заголовок не должен превышать 150 символов" };
  if (!body) return { ok: false, message: "Напишите текст" };
  if (body.length > QUESTION_LIMITS.body)
    return { ok: false, message: "Текст не должен превышать 10 000 символов" };
  const tags = draft.tags
    .split(",")
    .map((tag) => tag.trim().replace(/^#+/, "").trim())
    .filter(Boolean);
  if (tags.length > QUESTION_LIMITS.tags)
    return { ok: false, message: "Можно добавить до 5 тегов" };
  if (tags.some((tag) => tag.length > 32))
    return { ok: false, message: "Тег не должен превышать 32 символа" };
  if (draft.photoIds.length > QUESTION_LIMITS.photos)
    return { ok: false, message: "Можно прикрепить до 5 фото" };
  if (
    draft.photoIds.some((id) => !id || id.length > 128) ||
    new Set(draft.photoIds).size !== draft.photoIds.length
  )
    return { ok: false, message: "Проверьте выбранные фотографии" };
  return {
    ok: true,
    input: {
      title,
      body,
      category: draft.category,
      tags: [...new Set(tags)],
      photoIds: draft.photoIds,
    },
  };
}
