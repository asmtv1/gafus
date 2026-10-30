import { apiRequest, isolatedNonprodBrowserS3Url } from "../../shared/api/client";
import { publicImageUrl } from "./publicProfileApi";
import { QUESTION_CATEGORIES, QUESTION_LIMITS } from "@gafus/types";
import type { QuestionListItemDto, QuestionCategory } from "@gafus/types";

/** WEB1 owner profile needs Next's entire *visible question card* projection.
 * Shared public questionApi intentionally caches fewer fields; never widen
 * its public cache or leak raw Hono objects. Hono/Core enforces mine=true. */
export type ProfileQuestionCard = Pick<QuestionListItemDto,
  "id" | "title" | "category" | "status" | "answerCount" |
  "viewCount" | "createdAt" | "closed" | "tags" | "bestAnswer"
> & { authorName: string; authorAvatarUrl: string | null };
export type ProfileQuestionsPage = {
  items: ProfileQuestionCard[];
  nextPage: number | null;
  canPublish: boolean;
  blockReason: string | null;
};
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const statuses = ["waiting", "answered", "resolved"] as const;
const record = (v: unknown): Record<string,unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string,unknown> : null;
const safeId = (v: unknown): v is string => typeof v === "string" && ID.test(v) &&
  v !== "." && v !== "..";
const count = (v: unknown): v is number => typeof v === "number" &&
  Number.isSafeInteger(v) && v >= 0;
function card(raw: unknown): ProfileQuestionCard {
  const row=record(raw), author=record(row?.author), best=record(row?.bestAnswer);
  if(!row || !author || !safeId(row.id) ||
    typeof row.title!=="string" || row.title.length>QUESTION_LIMITS.title ||
    !QUESTION_CATEGORIES.includes(row.category as QuestionCategory) ||
    !statuses.includes(row.status as (typeof statuses)[number]) ||
    !count(row.answerCount) || !count(row.viewCount) ||
    typeof row.createdAt!=="string" || !Number.isFinite(new Date(row.createdAt).getTime()) ||
    typeof row.closed!=="boolean" ||
    !Array.isArray(row.tags) || row.tags.length>QUESTION_LIMITS.tags ||
    !row.tags.every(tag=>typeof tag==="string" && tag.length<=80) ||
    typeof author.name!=="string" || author.name.length>200 ||
    !(author.avatarUrl===undefined || author.avatarUrl===null ||
      (typeof author.avatarUrl==="string" && author.avatarUrl.length<=2000)) ||
    !(row.bestAnswer===null || (best && safeId(best.id) && typeof best.body==="string" &&
      best.body.length<=240))) throw Error("Сервер вернул некорректный список вопросов");
  // The question author avatar is part of the public Next question DTO.
  // Reject arbitrary signed external URLs; only the isolated approved dev
  // avatar signature is allowed, matching the existing public media policy.
  const candidate = publicImageUrl(typeof author.avatarUrl === "string" ? author.avatarUrl : null);
  const authorAvatarUrl = candidate &&
    (!candidate.includes("?") || isolatedNonprodBrowserS3Url(candidate,"documents","signed-get"))
    ? candidate : null;
  return {
    id:row.id as string,title:row.title as string,
    category:row.category as QuestionCategory,
    status:row.status as ProfileQuestionCard["status"],
    answerCount:row.answerCount as number,viewCount:row.viewCount as number,
    createdAt:row.createdAt as string,closed:row.closed as boolean,
    tags:row.tags as string[],
    bestAnswer:best?{id:best.id as string,body:best.body as string}:null,
    authorName:author.name as string,authorAvatarUrl,
  };
}
export async function listOwnerProfileQuestions(page=1):Promise<ProfileQuestionsPage>{
  if(!Number.isSafeInteger(page)||page<1||page>10000)
    throw Error("Некорректная страница вопросов");
  // Owner access is NEVER inferred from the URL; Core applies authorId=actor.
  const raw=record(await apiRequest<unknown>(
    `/api/v1/questions?page=${page}&sort=new&mine=true`,
    {method:"GET",browserAuth:true,expectedStatus:200},
  ));
  if(!raw||!Array.isArray(raw.items)||
    !(raw.nextPage===null || (Number.isSafeInteger(raw.nextPage)&&
      (raw.nextPage as number)>page && (raw.nextPage as number)<=10000)) ||
    typeof raw.canPublish!=="boolean" ||
    !(raw.blockReason===null||typeof raw.blockReason==="string"))
    throw Error("Сервер вернул некорректный список вопросов");
  const items=raw.items.map(card);
  if(new Set(items.map(item=>item.id)).size!==items.length)
    throw Error("Сервер вернул некорректный список вопросов");
  return {items,nextPage:raw.nextPage as number|null,
    canPublish:raw.canPublish as boolean,blockReason:raw.blockReason as string|null};
}
