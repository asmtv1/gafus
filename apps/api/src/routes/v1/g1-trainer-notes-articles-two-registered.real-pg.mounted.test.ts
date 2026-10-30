/** AG1 G3: two EXISTING registered Trainer metadata GETs -> original app/repositories -> own real PG18. */
import { Hono } from "hono";
import { prisma } from "@gafus/prisma";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { trainerNotesSummaryRoutes } from "./trainer-notes-summary";
import { trainerArticlesOwnSummaryRoutes } from "./trainer-articles-own-summary";

// These two route import closures contain only their own application/composition,
// the original SQL repositories and Prisma: NO write/auth/media/provider/queue imports.
// No side-effect mocks or target mocks are needed. The full app.ts is NOT imported.
const database = "gafus_refactor_trainer_metadata_hono_ag1_20261024";
const dir =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const sock = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const tag = "ag1_trainer_metadata_hono_sql_20261024";
const id = (name: string) => `ag1_g3_trainer_metadata_20261024_${name}`;
const f = {
  a: id("author_a"),
  b: id("author_b"),
  mod: id("moderator"),
  admin: id("admin"),
  empty: id("empty"),
  liker: id("like_user"),
  noteA1: id("note_a1"),
  noteA2: id("note_a2"),
  noteA3: id("note_a3"),
  noteB: id("note_b"),
  noteMod: id("note_mod"),
  noteAdmin: id("note_admin"),
  privateEntry: id("note_private_entry"),
  link: id("note_student_link"),
  artA1: id("article_a1"),
  artA2: id("article_a2"),
  artB: id("article_b"),
  artAdmin: id("article_admin"),
};
const users = [f.a, f.b, f.mod, f.admin, f.empty, f.liker];
const notes = [f.noteA1, f.noteA2, f.noteA3, f.noteB, f.noteMod, f.noteAdmin];
const articles = [f.artA1, f.artA2, f.artB, f.artAdmin];
const privateMarker = "FICTIONAL_NO_PRIVATE_ARTICLE_CONTENT_STUDENT_NOTE_ENTRY";
const date = (n: number) => new Date(`2026-10-${String(n).padStart(2, "0")}T10:00:00.000Z`);
let seeded = false;

const app = new Hono();
app.use("/api/v1/trainer/*", async (c, next) => {
  const roleHeader = c.req.header("x-own-actor-role");
  const role =
    roleHeader === "ADMIN" ||
    roleHeader === "MODERATOR" ||
    roleHeader === "USER" ||
    roleHeader === "TRAINER"
      ? roleHeader
      : "TRAINER";
  c.set("user", { id: c.req.header("x-own-actor-id") ?? f.a, role, username: "fictional-only" });
  await next();
});
app.route("/api/v1/trainer/notes", trainerNotesSummaryRoutes);
app.route("/api/v1/trainer/articles", trainerArticlesOwnSummaryRoutes);
const get = (path: string, actor = f.a, role = "TRAINER") =>
  app.request(`/api/v1/trainer/${path}`, {
    headers: { "x-own-actor-id": actor, "x-own-actor-role": role },
  });
const keys = (o: Record<string, unknown>, list: string[]) =>
  expect(Object.keys(o).sort()).toEqual([...list].sort());
const noteFields = ["id", "title", "tags", "createdAt"];
const articleFields = [
  "id",
  "title",
  "slug",
  "visibility",
  "likeCount",
  "viewCount",
  "createdAt",
  "updatedAt",
];

async function ownDbGuard() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_G3_TRAINER_METADATA_OWN_PG18).toBe("1");
  expect([
    u.protocol,
    u.hostname,
    u.port,
    u.pathname,
    u.searchParams.get("host"),
    u.searchParams.get("application_name"),
    u.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, sock, tag, ""]);
  const r = await prisma.$queryRaw<
    {
      db: boolean;
      v: boolean;
      dir: boolean;
      sock: boolean;
      unix: boolean;
      outsiders: bigint;
    }[]
  >`
  SELECT current_database()=${database} AS db,
    current_setting('server_version_num')='180004' AS v,
    current_setting('data_directory')=${dir} AS dir,
    current_setting('unix_socket_directories')=${sock} AS sock,
    current_setting('listen_addresses')='' AS unix,
    (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
      AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
      OR application_name IS DISTINCT FROM ${tag})) AS outsiders
  `;
  expect(r).toEqual([{ db: true, v: true, dir: true, sock: true, unix: true, outsiders: 0n }]);
}

beforeAll(async () => {
  await ownDbGuard();
  const existing = await prisma.$queryRaw<
    {
      u: bigint;
      n: bigint;
      a: bigint;
      likes: bigint;
      entries: bigint;
      links: bigint;
      ledger: bigint;
    }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS u,
      (SELECT count(*) FROM public."TrainerNote") AS n,
      (SELECT count(*) FROM public."Article") AS a,
      (SELECT count(*) FROM public."ArticleLike") AS likes,
      (SELECT count(*) FROM public."TrainerNoteEntry") AS entries,
      (SELECT count(*) FROM public."TrainerNoteStudent") AS links,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger
  `;
  expect(existing).toEqual([
    { u: 0n, n: 0n, a: 0n, likes: 0n, entries: 0n, links: 0n, ledger: 0n },
  ]);
  await prisma.user.createMany({
    data: [
      { id: f.a, username: f.a, password: "fictional", role: "TRAINER" },
      { id: f.b, username: f.b, password: "fictional", role: "TRAINER" },
      { id: f.mod, username: f.mod, password: "fictional", role: "MODERATOR" },
      { id: f.admin, username: f.admin, password: "fictional", role: "ADMIN" },
      { id: f.empty, username: f.empty, password: "fictional", role: "TRAINER" },
      { id: f.liker, username: f.liker, password: "fictional", role: "USER" },
    ],
  });
  seeded = true;
  await prisma.trainerNote.createMany({
    data: [
      { id: f.noteA1, trainerId: f.a, title: null, tags: [], createdAt: date(21) },
      { id: f.noteA2, trainerId: f.a, title: "A mid", tags: ["training"], createdAt: date(22) },
      { id: f.noteA3, trainerId: f.a, title: "A latest", tags: ["private"], createdAt: date(23) },
      { id: f.noteB, trainerId: f.b, title: "B note", tags: [], createdAt: date(24) },
      { id: f.noteMod, trainerId: f.mod, title: "Mod note", tags: [], createdAt: date(25) },
      { id: f.noteAdmin, trainerId: f.admin, title: "Admin note", tags: [], createdAt: date(26) },
    ],
  });
  // Deliberately present in physical tables, but prohibited from the metadata SELECT.
  await prisma.trainerNoteEntry.create({
    data: {
      id: f.privateEntry,
      noteId: f.noteA3,
      content: privateMarker,
      order: 0,
      isVisibleToStudent: false,
    },
  });
  await prisma.trainerNoteStudent.create({
    data: { id: f.link, noteId: f.noteA3, studentId: f.liker },
  });
  await prisma.article.createMany({
    data: [
      {
        id: f.artA1,
        authorId: f.a,
        title: "A older",
        slug: id("slug_a1"),
        visibility: "PUBLIC",
        content: privateMarker,
        description: privateMarker,
        logoImg: privateMarker,
        imageUrls: [privateMarker],
        videoUrl: privateMarker,
        viewCount: 0,
        createdAt: date(21),
        updatedAt: date(22),
      },
      {
        id: f.artA2,
        authorId: f.a,
        title: "A newer",
        slug: id("slug_a2"),
        visibility: "PAID",
        content: privateMarker,
        description: privateMarker,
        logoImg: privateMarker,
        imageUrls: [privateMarker],
        videoUrl: privateMarker,
        viewCount: 9,
        createdAt: date(23),
        updatedAt: date(24),
      },
      {
        id: f.artB,
        authorId: f.b,
        title: "B article",
        slug: id("slug_b"),
        visibility: "PUBLIC",
        content: privateMarker,
        viewCount: 3,
        createdAt: date(24),
        updatedAt: date(24),
      },
      {
        id: f.artAdmin,
        authorId: f.admin,
        title: "Admin article",
        slug: id("slug_admin"),
        content: privateMarker,
        createdAt: date(26),
        updatedAt: date(26),
      },
    ],
  });
  await prisma.articleLike.createMany({
    data: [
      { userId: f.b, articleId: f.artA2 },
      { userId: f.liker, articleId: f.artA2 },
      { userId: f.liker, articleId: f.artB },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await ownDbGuard();
    if (seeded) {
      await prisma.articleLike.deleteMany({ where: { articleId: { in: articles } } });
      await prisma.article.deleteMany({ where: { id: { in: articles } } });
      await prisma.trainerNoteEntry.deleteMany({ where: { id: f.privateEntry } });
      await prisma.trainerNoteStudent.deleteMany({ where: { id: f.link } });
      await prisma.trainerNote.deleteMany({ where: { id: { in: notes } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    expect(
      await prisma.$queryRaw<
        {
          u: bigint;
          n: bigint;
          a: bigint;
          likes: bigint;
          entries: bigint;
          links: bigint;
          ledger: bigint;
        }[]
      >`
      SELECT (SELECT count(*) FROM public."User") AS u,
      (SELECT count(*) FROM public."TrainerNote") AS n,
      (SELECT count(*) FROM public."Article") AS a,
      (SELECT count(*) FROM public."ArticleLike") AS likes,
      (SELECT count(*) FROM public."TrainerNoteEntry") AS entries,
      (SELECT count(*) FROM public."TrainerNoteStudent") AS links,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger
    `,
    ).toEqual([{ u: 0n, n: 0n, a: 0n, likes: 0n, entries: 0n, links: 0n, ledger: 0n }]);
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

describe("AG1 G3 current registered Trainer Notes+Articles metadata GETs real PG18", () => {
  it("notes/summary A pagination 2+1, original total, ISO/null and four-field whitelist", async () => {
    const r = await get("notes/summary?page=0&pageSize=2");
    expect(r.status).toBe(200);
    const j = await r.json();
    keys(j, ["success", "data"]);
    expect(j.success).toBe(true);
    keys(j.data, ["notes", "total", "page", "pageSize"]);
    expect(j.data).toMatchObject({ total: 3, page: 0, pageSize: 2 });
    expect(j.data.notes.map((n: { id: string }) => n.id)).toEqual([f.noteA3, f.noteA2]);
    for (const n of j.data.notes) {
      keys(n, noteFields);
      expect(n.createdAt).toMatch(/^2026-10-[0-9]{2}T10:00:00\.000Z$/);
    }
    const page1 = await get("notes/summary?page=1&pageSize=2");
    expect(page1.status).toBe(200);
    const j1 = await page1.json();
    expect(j1.data).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(j1.data.notes.map((n: { id: string }) => n.id)).toEqual([f.noteA1]);
    keys(j1.data.notes[0], noteFields);
    expect(j1.data.notes[0]).toMatchObject({
      title: null,
      tags: [],
      createdAt: date(21).toISOString(),
    });
    expect(JSON.stringify(j)).not.toContain(privateMarker);
    expect(JSON.stringify(j1)).not.toContain(f.liker);
  });
  it("articles/own-summary A: exact eight keys, ISO, SQL like counts, never article contents", async () => {
    const r = await get("articles/own-summary");
    expect(r.status).toBe(200);
    const j = await r.json();
    keys(j, ["success", "data"]);
    keys(j.data, ["articles"]);
    expect(j.data.articles.map((a: { id: string }) => a.id)).toEqual([f.artA2, f.artA1]);
    for (const a of j.data.articles) {
      keys(a, articleFields);
      expect(a.createdAt).toMatch(/^2026-10-[0-9]{2}T10:00:00\.000Z$/);
      expect(a.updatedAt).toMatch(/^2026-10-[0-9]{2}T10:00:00\.000Z$/);
    }
    expect(j.data.articles[0]).toMatchObject({ visibility: "PAID", likeCount: 2, viewCount: 9 });
    expect(j.data.articles[1]).toMatchObject({ visibility: "PUBLIC", likeCount: 0, viewCount: 0 });
    expect(JSON.stringify(j)).not.toContain(privateMarker);
    expect(JSON.stringify(j)).not.toContain(f.b);
  });
  it("two current registered GETs: owner isolation, empty actor, existing ADMIN and MOD distinctions", async () => {
    const nb = await get("notes/summary", f.b);
    expect(nb.status).toBe(200);
    expect((await nb.json()).data).toMatchObject({ total: 1, notes: [{ id: f.noteB }] });
    const ab = await get("articles/own-summary", f.b);
    expect(ab.status).toBe(200);
    expect((await ab.json()).data.articles.map((a: { id: string }) => a.id)).toEqual([f.artB]);
    const no = await get("notes/summary", f.empty);
    expect(no.status).toBe(200);
    expect((await no.json()).data).toMatchObject({ notes: [], total: 0, page: 0, pageSize: 50 });
    const ae = await get("articles/own-summary", f.empty);
    expect(ae.status).toBe(200);
    expect(await ae.json()).toEqual({ success: true, data: { articles: [] } });
    const all = await get("notes/summary", f.admin, "ADMIN");
    expect(all.status).toBe(200);
    expect((await all.json()).data.total).toBe(6);
    const ownAdmin = await get("articles/own-summary", f.admin, "ADMIN");
    expect(ownAdmin.status).toBe(200);
    expect((await ownAdmin.json()).data.articles.map((a: { id: string }) => a.id)).toEqual([
      f.artAdmin,
    ]);
    const modNotes = await get("notes/summary", f.mod, "MODERATOR");
    expect(modNotes.status).toBe(200);
    expect((await modNotes.json()).data).toMatchObject({ total: 1, notes: [{ id: f.noteMod }] });
    const modArt = await get("articles/own-summary", f.mod, "MODERATOR");
    expect(modArt.status).toBe(403);
    expect(await modArt.json()).toEqual({
      success: false,
      code: "FORBIDDEN",
      error: "Недостаточно прав",
    });
  });
  it("original BAD_QUERY and FORBIDDEN are unchanged; no GET storage writes", async () => {
    for (const path of [
      "notes/summary?pageSize=0",
      "notes/summary?unknown=1",
      "notes/summary?page=1&page=2",
      "articles/own-summary?authorId=" + f.b,
    ]) {
      const r = await get(path);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({
        success: false,
        code: "BAD_QUERY",
        error: "Некорректный запрос",
      });
    }
    for (const path of ["notes/summary", "articles/own-summary"]) {
      const r = await get(path, f.liker, "USER");
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({
        success: false,
        code: "FORBIDDEN",
        error: "Недостаточно прав",
      });
    }
    expect(await prisma.trainerNote.count()).toBe(notes.length);
    expect(await prisma.trainerNoteEntry.count()).toBe(1);
    expect(await prisma.trainerNoteStudent.count()).toBe(1);
    expect(await prisma.article.count()).toBe(articles.length);
    expect(await prisma.articleLike.count()).toBe(3);
  });
});
