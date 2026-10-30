/** Genuine registered Hono + JWT + WORK PG18: questions, answers, moderation. */
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

const prefix = "ag1_q_http_20261025_" + randomBytes(6).toString("hex");
const base = "http://127.0.0.1:3001/api/v1";
type Actor = { id: string; username: string; password: string; token?: string };
const actors: Actor[] = [];
const questionIds: string[] = [];
function ensure(c: unknown, name: string): asserts c {
  if (!c) throw Error("ASSERT_" + name);
}
function pass(name: string) {
  console.warn("AG1_QUESTIONS_REAL_HTTP " + name + "=PASS");
}
function obj(data: unknown): Record<string, unknown> {
  return data !== null && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}
async function http(path: string, method = "GET", actor?: Actor, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(actor?.token ? { Authorization: "Bearer " + actor.token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  return { status: res.status, data: obj(await res.json()) };
}
async function createActor(role: "USER" | "ADMIN", suffix: string) {
  const password = randomBytes(26).toString("base64url");
  const row = await prisma.user.create({
    data: {
      username: prefix + "_" + suffix,
      password: await bcrypt.hash(password, 10),
      passwordSetAt: new Date(),
      role,
      registrationPending: false,
    },
  });
  const actor = { id: row.id, username: row.username, password };
  actors.push(actor);
  const signed = await http("/auth/login", "POST", undefined, {
    username: actor.username,
    password: actor.password,
  });
  ensure(signed.status === 200 && signed.data.success === true, "AUTH");
  const token = obj(signed.data.data).accessToken;
  ensure(typeof token === "string" && token.length > 40, "JWT");
  (actor as Actor).token = token;
  return actor;
}
function payload(title = "Что делать при сильном возбуждении собаки?") {
  return {
    title,
    body: "Поделитесь личным опытом тренировки собаки, пожалуйста.",
    category: "Поведение",
    tags: ["прогулка"],
    photoIds: [],
    clientRequestId: randomUUID(),
  };
}
async function cleanup() {
  // Only synthetic authenticated owners, never restored production rows.
  for (const a of actors) {
    const current = await prisma.user.findUnique({
      where: { id: a.id },
      select: { username: true },
    });
    if (current?.username === a.username && current.username.startsWith(prefix))
      await prisma.user.delete({ where: { id: a.id } });
  }
}
async function main() {
  ensure(process.env.AG1_QUESTIONS_WORK_HTTP === "1", "OPT_IN");
  const u = new URL(process.env.DATABASE_URL ?? "");
  ensure(
    ["127.0.0.1", "localhost"].includes(u.hostname) &&
      u.port === "55921" &&
      u.pathname === "/gafus_refactor_real_work_20261024",
    "WORK_ONLY",
  );
  const meta = await prisma.$queryRaw<{ db: string; version: string }[]>`
   SELECT current_database() AS db, current_setting('server_version_num') AS version`;
  ensure(
    meta[0]?.db === "gafus_refactor_real_work_20261024" && meta[0]?.version === "180004",
    "PG18",
  );
  ensure(
    (
      await fetch("http://127.0.0.1:3001/health", {
        signal: AbortSignal.timeout(3500),
      })
    ).status === 200,
    "HONO",
  );
  pass("WORK_PG_AND_REGISTERED_HONO");
  const owner = await createActor("USER", "owner"),
    other = await createActor("USER", "other"),
    third = await createActor("USER", "third"),
    admin = await createActor("ADMIN", "admin");
  pass("FOUR_GENUINE_JWT_ROLES");
  const sent = payload();
  const pair = await Promise.all([
    http("/questions", "POST", owner, sent),
    http("/questions", "POST", owner, sent),
  ]);
  ensure(
    pair.every((p) => p.status === 200 && p.data.success === true),
    "CONCURRENT_QUESTION_200",
  );
  const qid = obj(pair[0].data.data).id;
  ensure(typeof qid === "string" && qid === obj(pair[1].data.data).id, "QUESTION_REPLAY_ID");
  questionIds.push(qid);
  ensure(
    (await prisma.question.count({ where: { id: qid, authorId: owner.id } })) === 1,
    "QUESTION_ONE_ROW",
  );
  const row = await prisma.question.findUnique({ where: { id: qid } });
  ensure(row?.title === sent.title && row.tags.includes("прогулка"), "QUESTION_SQL");
  const listed = await http("/questions?mine=true", "GET", owner);
  ensure(
    listed.status === 200 &&
      obj(listed.data.data).items instanceof Array &&
      (obj(listed.data.data).items as unknown[]).some((v) => obj(v).id === qid),
    "QUESTION_LIST_MINE",
  );
  pass("CONCURRENT_QUESTION_CREATE_ONE_SQL_ROW_AND_LIST");
  for (let i = 0; i < 2; i++) {
    const got = await http("/questions/" + qid, "GET", owner);
    ensure(got.status === 200 && got.data.success === true, "DETAIL_GET");
  }
  ensure(
    (await prisma.questionView.count({ where: { questionId: qid, userId: owner.id } })) === 1,
    "VIEW_ONCE_PER_ACCOUNT",
  );
  const forbiddenEdit = await http("/questions/" + qid, "PATCH", other, {
    title: sent.title,
    body: sent.body,
    category: sent.category,
    tags: sent.tags,
    photoIds: [],
  });
  ensure(forbiddenEdit.status === 403, "FOREIGN_EDIT_DENIED");
  pass("QUESTION_DETAILS_VIEWS_ONCE_OWNER_WRITE_403");
  const replyBody = {
    body: "Разбивайте упражнения на короткие повторения.",
    photoIds: [],
    clientRequestId: randomUUID(),
  };
  const replies = await Promise.all([
    http("/questions/" + qid + "/answers", "POST", other, replyBody),
    http("/questions/" + qid + "/answers", "POST", other, replyBody),
  ]);
  ensure(
    replies.every((r) => r.status === 200),
    "REPLAY_ANSWER_200",
  );
  const aid = obj(replies[0].data.data).id;
  ensure(typeof aid === "string" && aid === obj(replies[1].data.data).id, "REPLAY_ANSWER_IDENT");
  ensure(
    (await prisma.questionAnswer.count({ where: { questionId: qid, authorId: other.id } })) === 1,
    "ANSWER_ONE_SQL_ROW",
  );
  const heart = await http("/questions/answers/" + aid + "/heart", "POST", owner, { liked: true });
  ensure(heart.status === 200, "HEART_200");
  const repeatHeart = await http("/questions/answers/" + aid + "/heart", "POST", owner, {
    liked: true,
  });
  ensure(
    repeatHeart.status === 200 &&
      (await prisma.questionHeart.count({ where: { answerId: aid, userId: owner.id } })) === 1,
    "HEART_ONE_SQL",
  );
  const ownHeart = await http("/questions/answers/" + aid + "/heart", "POST", other, {
    liked: true,
  });
  ensure(ownHeart.status === 400 && ownHeart.data.code === "OWN_HEART", "OWN_HEART_DENIED");
  pass("ANSWERS_CONCURRENT_ONCE_HEART_IDEMPOTENT_SELF_DENIED");
  const nested = await http("/questions/" + qid + "/answers", "POST", third, {
    body: "Согласен, так становится проще.",
    replyToId: aid,
    photoIds: [],
    clientRequestId: randomUUID(),
  });
  ensure(nested.status === 200, "NESTED_200");
  const nestedId = obj(nested.data.data).id;
  ensure(typeof nestedId === "string", "NESTED_ID");
  const nestedSql = await prisma.questionAnswer.findUnique({ where: { id: nestedId } });
  ensure(nestedSql?.parentId === aid && nestedSql?.replyToId === aid, "NESTED_PARENT_SQL");
  const unauthorizedBest = await http("/questions/" + qid + "/best", "POST", other, {
    answerId: aid,
  });
  ensure(unauthorizedBest.status === 403, "FOREIGN_BEST_DENIED");
  const best = await http("/questions/" + qid + "/best", "POST", owner, { answerId: aid });
  ensure(best.status === 200, "BEST_200");
  const repeatBest = await http("/questions/" + qid + "/best", "POST", owner, { answerId: aid });
  ensure(repeatBest.status === 200, "BEST_REPLAY_200");
  ensure(
    (await prisma.question.findUnique({ where: { id: qid }, select: { bestAnswerId: true } }))
      ?.bestAnswerId === aid,
    "BEST_SQL",
  );
  pass("NESTED_REPLIES_BEST_OWNER_ONLY_REPLAY");
  const close = await http("/questions/" + qid + "/close", "POST", owner, { closed: true });
  ensure(close.status === 200, "CLOSE_200");
  const closedReply = await http("/questions/" + qid + "/answers", "POST", third, {
    body: "Это сообщение не должно сохраниться",
    photoIds: [],
    clientRequestId: randomUUID(),
  });
  ensure(
    closedReply.status === 409 && closedReply.data.code === "QUESTION_CLOSED",
    "CLOSED_REJECTS_ANSWER",
  );
  const reopened = await http("/questions/" + qid + "/close", "POST", owner, { closed: false });
  ensure(reopened.status === 200, "REOPEN_200");
  pass("CLOSE_409_AND_REOPEN");
  const deletedAnswer = await http("/questions/answers/" + aid, "DELETE", other);
  ensure(deletedAnswer.status === 200, "ANSWER_DELETE_200");
  const qrow = await prisma.question.findUnique({
    where: { id: qid },
    select: { bestAnswerId: true },
  });
  ensure(qrow?.bestAnswerId === null, "CLEARED_BEST_SQL");
  const tombstone = await http("/questions/" + qid, "GET", owner);
  const answers = obj(tombstone.data.data).answers;
  ensure(
    tombstone.status === 200 &&
      answers instanceof Array &&
      answers.some((a) => obj(a).id === aid && obj(a).body === "Ответ удалён"),
    "ANSWER_TOMBSTONE",
  );
  pass("SOFT_DELETE_ANSWER_TOMBSTONE_BEST_CLEARED");
  const report = await http("/questions/" + qid + "/reports", "POST", third, { reason: "Спам" });
  ensure(report.status === 200, "REPORT_200");
  const adminReport = await http("/questions/moderation", "GET", admin);
  ensure(adminReport.status === 200, "ADMIN_MODERATION_GET");
  const userModeration = await http("/questions/moderation", "GET", other);
  ensure(userModeration.status === 403, "USER_MODERATION_403");
  pass("REPORT_OWNER_ADMIN_ROLE_POLICY");
  const softDelete = await http("/questions/" + qid, "DELETE", owner);
  ensure(softDelete.status === 200, "QUESTION_DELETE_200");
  const gone = await http("/questions/" + qid, "GET", owner);
  ensure(gone.status === 404, "QUESTION_GONE_404");
  ensure(
    (await prisma.question.findUnique({ where: { id: qid }, select: { deletedAt: true } }))
      ?.deletedAt instanceof Date,
    "SOFT_DELETE_SQL",
  );
  pass("QUESTION_SOFT_DELETE_HTTP404_SQL");
}
void (async () => {
  try {
    await main();
  } catch (e) {
    process.exitCode = 1;
    console.error(
      "AG1_Q_HTTP_FAIL",
      e instanceof Error && e.message.startsWith("ASSERT_") ? e.message : "UNEXPECTED_REDACTED",
    );
  } finally {
    try {
      await cleanup();
      console.warn("AG1_QUESTIONS_REAL_HTTP_SYNTHETIC_CLEANUP=PASS");
    } catch {
      process.exitCode = 1;
      console.error("AG1_QUESTIONS_REAL_HTTP_CLEANUP_REVIEW_REQUIRED");
    }
    await prisma.$disconnect();
  }
})();
