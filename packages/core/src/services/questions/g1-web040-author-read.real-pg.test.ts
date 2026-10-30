/**
 * AG1 WEB040 approved A: authenticated author Questions READ at actual Core/Prisma
 * isolated PostgreSQL; no route, policy, fake Prisma, attachments or GET writes.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../../../prisma/node_modules/@prisma/client";
import { prisma } from "@gafus/prisma";
import { listQuestions } from "./service";

const key = randomBytes(6).toString("hex");
const prefix = "ag1web040q_" + key + "_";
const id = (name: string) => "c" + (key + name).padEnd(24, "0").slice(0, 24);
const authors = { a: id("authora"), b: id("authorb"), viewer: id("viewer") };
const questions = {
  newest: id("qnew"), older: id("qold"), deleted: id("qdeleted"),
  hidden: id("qhidden"), foreign: id("qforeign"),
};
const testUsers = Object.values(authors);
const testQuestions = Object.values(questions);
const ownAdminUrl = process.env.G1_AG1_WEB040_ADMIN_URL ?? "";
const admin = new PrismaClient({ datasources: { db: { url: ownAdminUrl } } });
type PgPrivileges = { sel: boolean; ins: boolean; upd: boolean; del: boolean };
let connected = false;
const dt = (day: number) => new Date("2032-11-" + String(day).padStart(2, "0") + "T10:00:00Z");

beforeAll(async () => {
  if (process.env.G1_AG1_OWN_PG !== "1") throw Error("OWN_PG_OPT_IN_REQUIRED");
  for (const [url, role] of [
    [process.env.DATABASE_URL ?? "", "ag1_stats135_read"],
    [ownAdminUrl, "ag1_course"],
  ] as const) {
    if (!url.includes("postgresql://" + role + "@") ||
        !url.includes("/ag1_stats135?") ||
        !url.includes(".ag1-course-pg/sock")) throw Error("NONOWNED_DATABASE_REFUSED");
  }
  await admin.$connect();
  connected = true;
  const perms = await prisma.$queryRawUnsafe<PgPrivileges[]>(
    "SELECT has_table_privilege(current_user, 'public.\"Question\"', 'SELECT') AS sel, " +
    "has_table_privilege(current_user, 'public.\"Question\"', 'INSERT') AS ins, " +
    "has_table_privilege(current_user, 'public.\"Question\"', 'UPDATE') AS upd, " +
    "has_table_privilege(current_user, 'public.\"Question\"', 'DELETE') AS del",
  );
  expect(perms).toEqual([{ sel: true, ins: false, upd: false, del: false }]);
  for (const [name, userId] of Object.entries(authors)) {
    const username = prefix + name;
    await admin.user.create({
      data: { id: userId, username, email: username + "@example.invalid",
        role: "USER", password: "synthetic-not-a-login" },
    });
  }
  for (const [name, questionId, author, day] of [
    ["newest", questions.newest, authors.a, 7],
    ["older", questions.older, authors.a, 4],
    ["deleted", questions.deleted, authors.a, 6],
    ["hidden", questions.hidden, authors.a, 5],
    ["foreign", questions.foreign, authors.b, 8],
  ] as const) {
    await admin.question.create({
      data: {
        id: questionId, authorId: author, clientRequestId: prefix + name,
        title: "Synthetic " + name, body: "Isolated WEB040 owner-read fixture",
        category: "other", createdAt: dt(day), activityAt: dt(day),
        deletedAt: name === "deleted" ? dt(9) : null,
        hiddenAt: name === "hidden" ? dt(9) : null,
      },
    });
  }
}, 90000);

afterAll(async () => {
  try {
    if (connected) {
      await admin.question.deleteMany({ where: { id: { in: testQuestions } } });
      await admin.user.deleteMany({ where: { id: { in: testUsers } } });
    }
  } finally {
    await prisma.$disconnect();
    await admin.$disconnect();
  }
}, 90000);

describe("WEB040 approved authenticated author Questions actual SQL", () => {
  it("viewer A/B receive only chosen author's visible questions, stable order", async () => {
    for (const viewer of [authors.viewer, authors.b, authors.viewer]) {
      const result = await listQuestions(viewer, { author: prefix + "a", sort: "new", page: 1 });
      expect(result.items.map((q) => q.id)).toEqual([questions.newest, questions.older]);
      expect(result.items.map((q) => q.author.username)).toEqual([prefix + "a", prefix + "a"]);
      expect(result.nextPage).toBeNull();
    }
    const result = await listQuestions(authors.viewer, { author: prefix + "b" });
    expect(result.items.map((q) => q.id)).toEqual([questions.foreign]);
  });

  it("deleted/hidden never leak from author's public list, even to author", async () => {
    const rows = await listQuestions(authors.a, { author: prefix + "a" });
    expect(rows.items.map((q) => q.id)).toEqual([questions.newest, questions.older]);
    expect(JSON.stringify(rows)).not.toContain(questions.deleted);
    expect(JSON.stringify(rows)).not.toContain(questions.hidden);
  });

  it("strict existing DTO never emits actor email, password or media URL", async () => {
    const result = await listQuestions(authors.viewer, { author: prefix + "a" });
    for (const row of result.items) {
      expect(row.author).toEqual({
        id: authors.a, username: prefix + "a", name: prefix + "a", avatarUrl: null,
      });
    }
    const json = JSON.stringify(result);
    for (const privateField of ["@example.invalid", "synthetic-not-a-login",
      "deletedAt", "hiddenAt", "imageUrls", "videoUrl", "signedUrl"]) {
      expect(json).not.toContain(privateField);
    }
  });

  it("empty page, invalid viewer 401, and SQL runtime cannot write", async () => {
    const empty = await listQuestions(authors.viewer, { author: prefix + "a", page: 2 });
    expect(empty.items).toEqual([]);
    expect(empty.nextPage).toBeNull();
    await expect(listQuestions(id("unknown"), { author: prefix + "a" }))
      .rejects.toMatchObject({ status: 401 });
    expect(await admin.question.count({ where: { id: { in: testQuestions } } })).toBe(5);
    expect(await admin.questionView.count({
      where: { questionId: { in: testQuestions } },
    })).toBe(0);
  });
});
