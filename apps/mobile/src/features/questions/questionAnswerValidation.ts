import { QUESTION_LIMITS } from "@gafus/types";

type AnswerDraft = { body: string; photoIds: string[]; replyToId?: string | null };
type AnswerInput = { body: string; photoIds: string[]; replyToId?: string | null };
export type CheckedAnswer = { ok: true; input: AnswerInput } | { ok: false; message: string };

/** Existing Core precommit answer schema; no new wire fields or decisions. */
export function validateQuestionAnswerDraft(draft: AnswerDraft): CheckedAnswer {
  const body = draft.body.trim();
  if (!body) return { ok: false, message: "Напишите текст" };
  if (body.length > QUESTION_LIMITS.body)
    return { ok: false, message: "Текст не должен превышать 10 000 символов" };
  if (draft.photoIds.length > QUESTION_LIMITS.photos)
    return { ok: false, message: "Можно прикрепить до 5 фото" };
  if (
    draft.photoIds.some((id) => !id || id.length > 128) ||
    new Set(draft.photoIds).size !== draft.photoIds.length
  )
    return { ok: false, message: "Проверьте выбранные фотографии" };
  if (draft.replyToId != null && (!draft.replyToId || draft.replyToId.length > 128))
    return { ok: false, message: "Недопустимый ответ для обсуждения" };
  return {
    ok: true,
    input: {
      body,
      photoIds: draft.photoIds,
      ...(draft.replyToId == null ? {} : { replyToId: draft.replyToId }),
    },
  };
}
