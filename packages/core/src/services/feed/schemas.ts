import { z } from "zod";
import { FEED_LIMITS as L, FEED_REACTIONS, FEED_SORT_OPTIONS, FEED_PHOTO_MIME_TYPES, FEED_VIDEO_MIME_TYPES, countFeedCharacters } from "../../../../types/src/feed";
import { FeedError } from "./errors";
export const feedIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const requestId = z.string().uuid();
const postText = z.string().refine(text => countFeedCharacters(text) <= L.postCharacters, "TEXT_TOO_LONG");
const commentText = z.string().trim().min(1).refine(text => countFeedCharacters(text) <= L.commentCharacters, "COMMENT_TOO_LONG");
export const feedCreatePostSchema = z.object({ clientRequestId: requestId }).strict();
export const feedRevisionSchema = z.object({
  clientRequestId: requestId,
  expectedVersion: z.number().int().nonnegative(),
  text: postText,
  attachmentIds: z.array(feedIdSchema).max(L.maxAttachments).refine(ids => new Set(ids).size === ids.length, "Duplicate attachment"),
  pollOnly: z.literal(true).optional(),
}).strict().refine(v => !!v.text.trim() || !!v.attachmentIds.length || v.pollOnly === true, "EMPTY_POST");
export const feedPublishSchema = z.object({ clientRequestId: requestId }).strict();
export const feedUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  kind: z.enum(["photo", "video"]),
  declaredMime: z.enum([...FEED_PHOTO_MIME_TYPES, ...FEED_VIDEO_MIME_TYPES] as const),
  declaredBytes: z.number().int().positive().max(L.videoBytes),
  clientRequestId: requestId,
}).strict().superRefine((v, ctx) => {
  const types: readonly string[] = v.kind === "photo" ? FEED_PHOTO_MIME_TYPES : FEED_VIDEO_MIME_TYPES;
  if (!types.includes(v.declaredMime)) ctx.addIssue({ code: "custom", message: "Incompatible format", path: ["declaredMime"] });
  if (v.kind === "photo" && v.declaredBytes > L.photoBytes) ctx.addIssue({ code: "custom", message: "UPLOAD_TOO_LARGE", path: ["declaredBytes"] });
});
export const feedCopyPhotoSchema = z.object({ photoId: feedIdSchema, clientRequestId: requestId }).strict();
export const feedCommentSchema = z.object({ text: commentText, replyToId: feedIdSchema.nullable().optional(), clientRequestId: requestId }).strict();
export const feedCommentEditSchema = z.object({ text: commentText }).strict();
export const feedReactionSchema = z.object({ reaction: z.enum(FEED_REACTIONS) }).strict();
export const feedPollSaveSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  question: z.string().trim().min(1).max(500),
  explanation: z.string().trim().max(2000).nullable().optional(),
  allowMultiple: z.boolean().default(false),
  isQuiz: z.boolean().default(false),
  isAnonymous: z.boolean().default(false),
  hideResults: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  endDate: z.string().datetime({ offset: true }).nullable().optional(),
  options: z.array(z.object({
    text: z.string().trim().min(1).max(200),
    imageMediaId: feedIdSchema.nullable().optional(),
    isCorrect: z.boolean().default(false),
  }).strict()).min(2).max(10),
}).strict().superRefine((value, ctx) => {
  const correct = value.options.filter(option => option.isCorrect).length;
  if ((!value.isQuiz && correct !== 0) ||
      (value.isQuiz && (correct < 1 || (!value.allowMultiple && correct !== 1)))) {
    ctx.addIssue({ code: "custom", message: "Некорректные ответы викторины" });
  }
  const normalized = value.options.map(option => option.text.toLocaleLowerCase("ru"));
  if (new Set(normalized).size !== normalized.length) {
    ctx.addIssue({ code: "custom", message: "Повторяющиеся варианты ответа" });
  }
});
export const feedPollVoteSchema = z.object({
  optionIds: z.array(feedIdSchema).min(1).max(10)
    .refine(ids => new Set(ids).size === ids.length, "Повторяющиеся варианты"),
}).strict();
export const feedListSchema = z.object({
  cursor: z.string().min(1).max(512).nullable().optional(),
  pageSize: z.number().int().min(1).max(L.maxPageSize).default(L.pageSize),
}).strict();
export const feedPostListSchema = feedListSchema.extend({ sort: z.enum(FEED_SORT_OPTIONS).default("new") });
export const feedReactionListSchema = feedListSchema.extend({ reaction: z.enum(FEED_REACTIONS).optional() });
export function feedParse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues[0]?.message;
    const code = msg === "TEXT_TOO_LONG" || msg === "EMPTY_POST" || msg === "COMMENT_TOO_LONG" || msg === "UPLOAD_TOO_LARGE" ? msg : "VALIDATION_ERROR";
    throw new FeedError(code, undefined, 400);
  }
  return result.data;
}
