import { z } from "zod";
import * as service from "@gafus/core/services/questions";
import { uploadQuestionPhoto, deleteUnusedQuestionPhoto, getQuestionPhotoProcessingStatus } from "@gafus/core/services/questions";
import {
  getQuestionModeration,
  moderateQuestionReport,
  unblockQuestionsUser,
} from "@gafus/core/services/questions";
import { QuestionError } from "@gafus/core/services/questions";
import { QUESTION_LIMITS } from "@gafus/types";
const pageSchema = z.coerce.number().int().min(1).max(10000).default(1);
/** Shared request decoding. No authorization, quotas, or state rules in adapters. */
export async function dispatchQuestionsRequest(userId: string, request: Request, path: string) {
  const parts = path.split("/").filter(Boolean);
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const method = request.method;
  const body = async () =>
    JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 100000)));
  if (!parts.length) {
    if (method === "GET") return service.listQuestions(userId, query);
    if (method === "POST") return service.createQuestion(userId, await body());
  }
  if (parts[0] === "photos" && parts.length <= 2) {
    if (method === "POST" && parts.length === 1) {
      const length = Number(request.headers.get("content-length"));
      if (length > QUESTION_LIMITS.photoBytes + 65536)
        throw new QuestionError("PHOTO_SIZE", "Фото должно быть не больше 10 МБ", 413);
      const bytes = await readLimitedBody(request, QUESTION_LIMITS.photoBytes + 65536);
      const form = await new Response(bytes, {
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      }).formData();
      const file = form.get("file");
      if (!file || typeof file === "string")
        throw new QuestionError("PHOTO_REQUIRED", "Выберите фото");
      if (file.size > QUESTION_LIMITS.photoBytes)
        throw new QuestionError("PHOTO_SIZE", "Фото должно быть не больше 10 МБ", 413);
      return uploadQuestionPhoto(userId, new Uint8Array(await file.arrayBuffer()), {
        allowAsync: request.headers.get("x-gafus-questions-async") === "1",
      });
    }
    if (method === "GET" && parts[1])
      return getQuestionPhotoProcessingStatus(userId, parts[1]);
    if (method === "DELETE" && parts[1]) return deleteUnusedQuestionPhoto(userId, parts[1]);
  }
  if (parts[0] === "moderation") {
    if (parts.length === 1 && method === "GET")
      return getQuestionModeration(userId, pageSchema.parse(query.page));
    if (parts.length === 1 && method === "POST")
      return moderateQuestionReport(userId, await body());
    if (parts.length === 3 && parts[1] === "blocks" && method === "DELETE")
      return unblockQuestionsUser(userId, parts[2]!);
  }
  if (parts[0] === "answers" && parts[1]) {
    const id = parts[1];
    if (parts.length === 2 && method === "PATCH")
      return service.editQuestionAnswer(userId, id, await body());
    if (parts.length === 2 && method === "DELETE") return service.deleteQuestionAnswer(userId, id);
    if (parts.length === 3 && parts[2] === "heart" && method === "POST")
      return service.setQuestionHeart(
        userId,
        id,
        z.object({ liked: z.boolean() }).parse(await body()).liked,
      );
    if (parts.length === 3 && parts[2] === "replies" && method === "GET")
      return service.getQuestionReplies(userId, id, pageSchema.parse(query.page));
  }
  if (parts[0] && !["photos", "answers", "moderation"].includes(parts[0])) {
    const id = parts[0];
    if (parts.length === 1 && method === "GET") return service.getQuestion(userId, id, query);
    if (parts.length === 1 && method === "PATCH")
      return service.editQuestion(userId, id, await body());
    if (parts.length === 1 && method === "DELETE") return service.deleteQuestion(userId, id);
    if (parts.length === 2 && method === "POST") {
      if (parts[1] === "answers") return service.createQuestionAnswer(userId, id, await body());
      if (parts[1] === "reports") return service.reportQuestion(userId, id, await body());
      if (parts[1] === "best")
        return service.setQuestionBestAnswer(
          userId,
          id,
          z.object({ answerId: z.string().min(1).nullable() }).parse(await body()).answerId,
        );
      if (parts[1] === "close")
        return service.setQuestionClosed(
          userId,
          id,
          z.object({ closed: z.boolean() }).parse(await body()).closed,
        );
    }
  }
  throw new QuestionError("NOT_FOUND", "Маршрут не найден", 404);
}

export { questionHttpError } from "@gafus/core/services/questions";

async function readLimitedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > limit) {
        await reader.cancel();
        throw new QuestionError("BODY_SIZE", "Запрос слишком большой", 413);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
