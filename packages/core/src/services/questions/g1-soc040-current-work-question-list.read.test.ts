/** SOC040: original Core question catalog on permanent restricted work PG18.
 * Internal application read, NOT Hono authentication or question-detail views.
 * No real records, names, IDs, photo URLs or JWT logged. */
import { afterAll, describe, it, vi } from "vitest";

const prohibited = vi.hoisted(() =>
  vi.fn((): never => {
    throw Error("NON_READ_PROVIDER_OR_REWARD_DENIED");
  }),
);
// These modules are unrelated to Question LIST; fail closed if invoked and do
// not evaluate protected CDN signing, media or reward module dependencies.
vi.mock("./presentPhoto", () => ({ presentQuestionPhotoUrl: prohibited }));
vi.mock("../gafus/rewardService", () => ({
  awardActivityTx: prohibited,
  awardBonusTx: prohibited,
}));

import { prisma } from "@gafus/prisma";
import { listQuestions } from "./service";

const assertSafe = (ok: boolean, code: string) => {
  if (!ok) throw Error(code);
};
const isIso = (s: unknown) =>
  typeof s === "string" && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;

afterAll(async () => {
  await prisma.$disconnect();
});
describe("original Question Core LIST / real permanent WORK PG18 READ", () => {
  it("proves restricted app role, work DB and physical read-only setting before target queries", async () => {
    const rows = await prisma.$queryRaw<
      { database: string; role: string; readonly: string; timeout: string }[]
    >`
      SELECT current_database() AS database, current_user AS role,
        current_setting('default_transaction_read_only') AS readonly,
        current_setting('statement_timeout') AS timeout`;
    assertSafe(
      rows.length === 1 && rows[0].database === "gafus_refactor_real_work_20261024",
      "WRONG_WORK_DB",
    );
    assertSafe(rows[0].role === "gafus_refactor_local_real", "WRONG_APP_ROLE");
    assertSafe(rows[0].readonly === "on" && rows[0].timeout !== "0", "READ_ONLY_NOT_ENFORCED");
    process.stdout.write("AG1_SOC040_READONLY_WORK_PRISMA_CONTEXT_PASS\n");
  });

  it("reads only active questions and canonical list JSON without creating views", async () => {
    const actor = await prisma.user.findUnique({
      where: { username: "admin" },
      select: { id: true },
    });
    assertSafe(Boolean(actor?.id), "NO_APPROVED_EXISTING_LOCAL_ACTOR");
    const visible = await prisma.question.count({ where: { deletedAt: null, hiddenAt: null } });
    const blocked = await prisma.question.count({
      where: { OR: [{ deletedAt: { not: null } }, { hiddenAt: { not: null } }] },
    });
    assertSafe(visible > 0 && blocked > 0, "NO_REAL_VISIBILITY_FIXTURE");
    const rows = await listQuestions(actor!.id, { sort: "new", page: 1 });
    assertSafe(rows.items.length === visible, "HIDDEN_OR_DELETED_QUESTION_EXPOSED");
    assertSafe(rows.nextPage === null, "INCORRECT_REAL_PAGINATION");
    assertSafe(typeof rows.canPublish === "boolean", "PUBLISH_FLAG_WIRE_INVALID");
    for (const item of rows.items) {
      assertSafe(isIso(item.createdAt), "QUESTION_CREATED_AT_INVALID");
      assertSafe(item.editedAt === null || isIso(item.editedAt), "QUESTION_EDITED_AT_INVALID");
      assertSafe(
        Array.isArray(item.tags) && typeof item.author?.username === "string",
        "QUESTION_LIST_DTO_INVALID",
      );
      assertSafe(
        ["waiting", "answered", "resolved"].includes(item.status),
        "QUESTION_STATUS_INVALID",
      );
      assertSafe(
        Number.isSafeInteger(item.answerCount) && item.answerCount >= 0,
        "ANSWER_COUNT_INVALID",
      );
    }
    const viewCount = await prisma.questionView.count();
    const again = await listQuestions(actor!.id, { sort: "active", page: 1 });
    assertSafe(again.items.length === visible, "ACTIVE_SORT_VISIBILITY_MISMATCH");
    assertSafe((await prisma.questionView.count()) === viewCount, "QUESTION_LIST_CREATED_VIEWS");
    assertSafe(prohibited.mock.calls.length === 0, "EXTERNAL_PROVIDER_OR_REWARD_INVOKED");
    process.stdout.write("AG1_SOC040_REAL_WORK_VISIBLE_QUESTIONS_READ_PASS\n");
  });

  it("honors existing actor's mine and public author filters without foreign items", async () => {
    const actor = await prisma.user.findUnique({
      where: { username: "admin" },
      select: { id: true },
    });
    assertSafe(Boolean(actor?.id), "LOCAL_ACTOR_MISSING");
    const owned = await prisma.question.count({
      where: { authorId: actor!.id, deletedAt: null, hiddenAt: null },
    });
    const mine = await listQuestions(actor!.id, { mine: "true" });
    assertSafe(
      mine.items.length === owned && mine.items.every((x) => x.author.id === actor!.id),
      "MINE_OWNER_SCOPE_FAILED",
    );
    const another = await prisma.question.findFirst({
      where: { deletedAt: null, hiddenAt: null },
      select: { author: { select: { username: true } } },
    });
    assertSafe(Boolean(another?.author.username), "PUBLIC_AUTHOR_MISSING");
    const byAuthor = await listQuestions(actor!.id, { author: another!.author.username });
    assertSafe(
      byAuthor.items.length > 0 &&
        byAuthor.items.every((x) => x.author.username === another!.author.username),
      "PUBLIC_AUTHOR_SCOPE_FAILED",
    );
    assertSafe(prohibited.mock.calls.length === 0, "NON_READ_SIDE_EFFECT_CALLED");
    process.stdout.write("AG1_SOC040_REAL_WORK_MINE_AND_AUTHOR_FILTERS_PASS\n");
  });
});
