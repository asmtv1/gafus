/**
 * AG1 cont139 minimal Trainer Notes LIST.
 * Deliberately DOES NOT call the legacy getTrainerNotes (which SELECTs
 * private entry contents and student identities). No write mutations.
 * Both count + page are read from a single RepeatableRead SQL snapshot.
 */
import { Hono } from "hono";
import { readTrainerNotesSummaryApplication } from "../../modules/trainer-notes/composition/read-notes-summary.js";
import type {TrainerNotesSummaryRead} from
  "../../../../../packages/types/src/data/trainer-read-contracts";

export const trainerNotesSummaryRoutes = new Hono();

const MAX_PAGE = 1000;
const MAX_PAGE_SIZE = 50;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

function parsePage(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!DECIMAL.test(value)) throw new Error("BAD_QUERY");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > max) throw new Error("BAD_QUERY");
  return parsed;
}

function parseQuery(query: Record<string, string[]>): {
  page: number; pageSize: number;
} {
  const keys = Object.keys(query);
  if (keys.some((key) => !["page", "pageSize"].includes(key))) {
    throw new Error("BAD_QUERY");
  }
  if (keys.some((key) => query[key]?.length !== 1)) {
    throw new Error("BAD_QUERY");
  }
  const page = parsePage(query.page?.[0], 0, MAX_PAGE);
  const pageSize = parsePage(query.pageSize?.[0], 50, MAX_PAGE_SIZE);
  if (pageSize < 1) throw new Error("BAD_QUERY");
  return { page, pageSize };
}
trainerNotesSummaryRoutes.get("/summary", async (c) => {
  let paging: {page:number;pageSize:number};
  try {
    if (c.req.raw.body !== null) throw new Error("BAD_QUERY");
    paging = parseQuery(c.req.queries());
  } catch {
    return c.json({success:false,code:"BAD_QUERY",error:"Некорректный запрос"},400);
  }
  const actor = c.get("user");
  if (!["TRAINER", "MODERATOR", "ADMIN"].includes(actor.role)) {
    return c.json({success:false,code:"FORBIDDEN",error:"Недостаточно прав"},403);
  }
  try {
    const result = await readTrainerNotesSummaryApplication.execute({
      actorUserId: actor.id,
      isAdmin: actor.role === "ADMIN",
      page: paging.page,
      pageSize: paging.pageSize,
    });
    return c.json({success:true,data:result} satisfies TrainerNotesSummaryRead,200);
  } catch {
    return c.json({
      success:false,code:"INTERNAL_SERVER_ERROR",error:"Внутренняя ошибка сервера",
    },500);
  }
});
