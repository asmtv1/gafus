/** Student Notes G3: original registered GET /notes/student, canonical Core strict+Prisma PG18 -> JSON. */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";

// The original Notes Core imports notifications for UNRELATED writes.
// Keep only this unused import fail-closed; real target Core/Prisma are not mocked.
const pushAttempt = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("UNUSED_STUDENT_NOTE_NOTIFICATION_WRITE_FORBIDDEN");
  }),
);
vi.mock("@gafus/core/services/notifications", () => ({
  createImmediatePushNotification: pushAttempt,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
import { notesRoutes } from "./notes";

const database = "gafus_refactor_student_notes_hono_ag1_20261024";
const dataDirectory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_student_notes_hono_sql_20261024";
const namespace = "ag1notes_hono_pg18_20261024_";
const id = (part: string) => namespace + part;
const fixture = {
  trainer: id("trainer"),
  studentA: id("student_a"),
  studentB: id("student_b"),
  studentC: id("student_c"),
  newest: id("note_newest"),
  older: id("note_older"),
  onlyPrivate: id("note_only_private"),
  onlyB: id("note_only_b"),
  unassigned: id("note_unassigned"),
};
const noteIds = [
  fixture.newest,
  fixture.older,
  fixture.onlyPrivate,
  fixture.onlyB,
  fixture.unassigned,
];
const actorIds = [fixture.trainer, fixture.studentA, fixture.studentB, fixture.studentC];
let seeded = false;

async function assertOwnDatabaseIdentity() {
  const url = process.env.DATABASE_URL ?? "";
  const parsed = new URL(url);
  expect(parsed.protocol).toBe("postgresql:");
  expect(parsed.hostname).toBe("localhost");
  expect(parsed.port).toBe("55917");
  expect(parsed.pathname).toBe("/" + database);
  expect(parsed.searchParams.get("host")).toBe(socket);
  expect(parsed.password).toBe("");
  expect(parsed.searchParams.get("application_name")).toBe(appTag);
  expect(process.env.AG1_NOTES_HONO_OWN_PG18).toBe("1");
  const rows = await prisma.$queryRaw<
    {
      correct_db: boolean;
      correct_version: boolean;
      correct_data: boolean;
      socket_only: boolean;
      correct_socket: boolean;
      peers: bigint;
    }[]
  >`
    SELECT current_database() = ${database} AS correct_db,
      current_setting('server_version_num') = '180004' AS correct_version,
      current_setting('data_directory') = ${dataDirectory} AS correct_data,
      current_setting('listen_addresses') = '' AS socket_only,
      current_setting('unix_socket_directories') = ${socket} AS correct_socket,
      (SELECT count(*) FROM pg_stat_activity
       WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()
          AND (datname IS DISTINCT FROM ${database} OR application_name IS DISTINCT FROM ${appTag})) AS peers
  `;
  expect(rows).toEqual([
    {
      correct_db: true,
      correct_version: true,
      correct_data: true,
      socket_only: true,
      correct_socket: true,
      peers: 0n,
    },
  ]);
}

beforeAll(async () => {
  await assertOwnDatabaseIdentity();
  const existing = await prisma.$queryRaw<
    {
      users: bigint;
      notes: bigint;
      entries: bigint;
      assignments: bigint;
      profiles: bigint;
      ledger: bigint;
    }[]
  >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."TrainerNote") AS notes,
        (SELECT count(*) FROM public."TrainerNoteEntry") AS entries,
        (SELECT count(*) FROM public."TrainerNoteStudent") AS assignments,
        (SELECT count(*) FROM public."UserProfile") AS profiles,
        (SELECT count(*) FROM public._prisma_migrations) AS ledger
  `;
  expect(existing).toEqual([
    {
      users: 0n,
      notes: 0n,
      entries: 0n,
      assignments: 0n,
      profiles: 0n,
      ledger: 0n,
    },
  ]);
  for (const [userId, role] of [
    [fixture.trainer, "TRAINER"],
    [fixture.studentA, "USER"],
    [fixture.studentB, "USER"],
    [fixture.studentC, "USER"],
  ] as const) {
    await prisma.user.create({
      data: { id: userId, username: userId, password: "fictional-not-a-password", role },
    });
  }
  seeded = true;
  await prisma.userProfile.create({
    data: {
      id: id("profile"),
      userId: fixture.trainer,
      fullName: "Fictional Trainer",
      avatarUrl: null,
    },
  });
  for (const [noteId, title, createdAt, tags] of [
    [fixture.newest, "Later lesson", new Date("2031-03-03T10:00:00.000Z"), ["fictional"]],
    [fixture.older, null, new Date("2031-03-01T10:00:00.000Z"), []],
    [fixture.onlyPrivate, "Hidden note", new Date("2031-03-02T10:00:00.000Z"), []],
    [fixture.onlyB, "Only B", new Date("2031-03-04T10:00:00.000Z"), []],
    [fixture.unassigned, "Unassigned", new Date("2031-03-05T10:00:00.000Z"), []],
  ] as const) {
    await prisma.trainerNote.create({
      data: {
        id: noteId,
        trainerId: fixture.trainer,
        title,
        createdAt,
        tags: [...tags],
      },
    });
  }
  for (const [noteId, studentId] of [
    [fixture.newest, fixture.studentA],
    [fixture.older, fixture.studentA],
    [fixture.onlyPrivate, fixture.studentA],
    [fixture.onlyB, fixture.studentB],
  ] as const) {
    await prisma.trainerNoteStudent.create({
      data: { id: id("link_" + noteId + studentId), noteId, studentId },
    });
  }
  for (const [noteId, name, order, isVisibleToStudent] of [
    [fixture.newest, "new visible", 2, true],
    [fixture.newest, "old visible", 1, true],
    [fixture.newest, "top private", 0, false],
    [fixture.older, "older visible", 3, true],
    [fixture.older, "older private", 1, false],
    [fixture.onlyPrivate, "only private", 1, false],
    [fixture.onlyB, "B only visible", 1, true],
    [fixture.unassigned, "unassigned visible", 1, true],
  ] as const) {
    await prisma.trainerNoteEntry.create({
      data: {
        id: id("entry_" + name.replace(/ /g, "_")),
        noteId,
        content: name,
        order,
        isVisibleToStudent,
        createdAt: new Date("2031-03-06T10:00:00.000Z"),
        updatedAt: new Date("2031-03-07T10:00:00.000Z"),
      },
    });
  }
}, 45000);

afterAll(async () => {
  try {
    // Only own fictional IDs in a verified fresh, isolated DB; no TRUNCATE or DROP.
    await assertOwnDatabaseIdentity();
    if (seeded) {
      await prisma.trainerNoteEntry.deleteMany({ where: { noteId: { in: noteIds } } });
      await prisma.trainerNoteStudent.deleteMany({ where: { noteId: { in: noteIds } } });
      await prisma.trainerNote.deleteMany({ where: { id: { in: noteIds } } });
      await prisma.userProfile.deleteMany({ where: { userId: { in: actorIds } } });
      await prisma.user.deleteMany({ where: { id: { in: actorIds } } });
    }
    const after = await prisma.$queryRaw<
      { users: bigint; notes: bigint; entries: bigint; links: bigint; ledger: bigint }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."TrainerNote") AS notes,
        (SELECT count(*) FROM public."TrainerNoteEntry") AS entries,
        (SELECT count(*) FROM public."TrainerNoteStudent") AS links,
        (SELECT count(*) FROM public._prisma_migrations) AS ledger
    `;
    expect(after).toEqual([{ users: 0n, notes: 0n, entries: 0n, links: 0n, ledger: 0n }]);
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

// Registered production subrouter under unchanged app.ts prefix.
// Principal comes solely from the synthetic fixture seam; no live JWT or HTTP socket.
const app = new Hono();
app.use("/api/v1/notes/*", async (c, next) => {
  c.set("user", {
    id: c.req.header("x-own-test-student") ?? fixture.studentA,
    role: "USER",
    username: "fictional-student",
  });
  await next();
});
app.route("/api/v1/notes", notesRoutes);
const get = (studentId = fixture.studentA) =>
  app.request("/api/v1/notes/student", {
    headers: { "x-own-test-student": studentId },
  });
const keys = (o: Record<string, unknown>, k: string[]) =>
  expect(Object.keys(o).sort()).toEqual([...k].sort());
const noteKeys = ["id", "title", "tags", "entries", "trainer", "createdAt"];
const entryKeys = ["id", "content", "order", "isVisibleToStudent", "createdAt", "updatedAt"];

const expectPrivacyHeaders = (r: Response) => {
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
};

describe("G3 existing registered Student Notes GET strict Core PG18 and JSON", () => {
  it("GET student A: two assigned visible notes, exact whitelist and chronological entries", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expectPrivacyHeaders(r);
    const payload = await r.json();
    keys(payload, ["success", "data"]);
    expect(payload.success).toBe(true);
    expect(payload.data.map((n: { id: string }) => n.id)).toEqual([fixture.newest, fixture.older]);
    expect(
      payload.data.map((n: { entries: { content: string }[] }) => n.entries.map((x) => x.content)),
    ).toEqual([["old visible", "new visible"], ["older visible"]]);
    for (const note of payload.data) {
      keys(note, noteKeys);
      expect(note.createdAt).toMatch(/^2031-03-0[1-5]T10:00:00\.000Z$/);
      keys(note.trainer, ["id", "username", "profile"]);
      for (const entry of note.entries) {
        keys(entry, entryKeys);
        expect(entry.isVisibleToStudent).toBe(true);
        expect(entry.createdAt).toBe("2031-03-06T10:00:00.000Z");
        expect(entry.updatedAt).toBe("2031-03-07T10:00:00.000Z");
      }
    }
    expect(payload.data[0].trainer).toEqual({
      id: fixture.trainer,
      username: fixture.trainer,
      profile: { fullName: "Fictional Trainer", avatarUrl: null },
    });
    expect(payload.data[0].tags).toEqual(["fictional"]);
    expect(payload.data[0].createdAt).toBe("2031-03-03T10:00:00.000Z");
    expect(payload.data[0].entries.map((x: { order: number }) => x.order)).toEqual([1, 2]);
  });
  it("nullable title and no private/hidden/unassigned note or entry leaks", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expectPrivacyHeaders(r);
    const payload = await r.json();
    expect(payload.data[1].title).toBeNull();
    expect(payload.data[1].tags).toEqual([]);
    const out = JSON.stringify(payload);
    for (const marker of [
      fixture.onlyPrivate,
      fixture.onlyB,
      fixture.unassigned,
      "top private",
      "older private",
      "only private",
      "B only visible",
      "unassigned visible",
    ]) {
      expect(out).not.toContain(marker);
    }
    expect(await prisma.trainerNote.count()).toBe(noteIds.length);
    expect(await prisma.trainerNoteEntry.count()).toBe(8);
    expect(pushAttempt).not.toHaveBeenCalled();
  });
  it("student B sees only own note; unassigned C receives true 200 empty array", async () => {
    const b = await get(fixture.studentB);
    expect(b.status).toBe(200);
    expectPrivacyHeaders(b);
    const data = await b.json();
    expect(data.success).toBe(true);
    expect(data.data.map((n: { id: string }) => n.id)).toEqual([fixture.onlyB]);
    expect(data.data[0].entries.map((e: { content: string }) => e.content)).toEqual([
      "B only visible",
    ]);
    expect(JSON.stringify(data)).not.toContain(fixture.newest);
    const c = await get(fixture.studentC);
    expect(c.status).toBe(200);
    expectPrivacyHeaders(c);
    expect(await c.json()).toEqual({ success: true, data: [] });
    expect(pushAttempt).not.toHaveBeenCalled();
  });
});
