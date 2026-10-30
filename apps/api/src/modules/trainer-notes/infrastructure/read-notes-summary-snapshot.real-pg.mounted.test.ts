/** AG1-090: actual trainer-notes repository and application on owned production-shaped PG18. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { readTrainerNotesSummarySnapshot } from "./read-notes-summary-snapshot";
import { readTrainerNotesSummaryApplication } from "../composition/read-notes-summary";

const database = "gafus_refactor_trainer_notes_summary_ag1_20261024";
const dataDir =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_trainer_notes_summary_pg18_20261024";
const p = "ag1_trainer_summary_pg18_20261024_";
const id = (part: string) => p + part;
const U = {
  trainerA: id("trainer_a"),
  trainerB: id("trainer_b"),
  empty: id("trainer_empty"),
  student: id("student"),
};
const actors = Object.values(U);
const N = {
  a1: id("a1"),
  a2: id("a2"),
  a3: id("a3"),
  a4: id("a4"),
  a5: id("a5"),
  b1: id("b1"),
  b2: id("b2"),
  snapshotNew: id("snapshot_new"),
};
const ids = Object.values(N);
const originalDates = {
  a1: "2026-10-20T10:00:00.000Z",
  a2: "2026-10-21T10:00:00.000Z",
  a3: "2026-10-22T10:00:00.000Z",
  a4: "2026-10-23T10:00:00.000Z",
  a5: "2026-10-24T10:00:00.000Z",
  b1: "2026-10-19T10:00:00.000Z",
  b2: "2026-10-25T10:00:00.000Z",
};
const secret = "FICTIONAL_PRIVATE_TRAINER_NOTE_CONTENT_NEVER_SELECT";
const entryId = id("private_entry");
const assignmentId = id("student_link");
let seeded = false;

async function assertOwnedDB() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_TRAINER_NOTES_SUMMARY_PG18).toBe("1");
  expect([
    u.protocol,
    u.hostname,
    u.port,
    u.pathname,
    u.searchParams.get("host"),
    u.searchParams.get("application_name"),
    u.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, socket, appTag, ""]);
  const identity = await prisma.$queryRaw<
    {
      db: boolean;
      version: boolean;
      data: boolean;
      unix: boolean;
      sock: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${dataDir} AS data,
      current_setting('listen_addresses')='' AS unix,
      current_setting('unix_socket_directories')=${socket} AS sock,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
       AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
        OR application_name IS DISTINCT FROM ${appTag})) AS outsiders
  `;
  expect(identity).toEqual([
    { db: true, version: true, data: true, unix: true, sock: true, outsiders: 0n },
  ]);
}
async function ownCounts() {
  return prisma.$queryRaw<
    { users: bigint; notes: bigint; entries: bigint; links: bigint; ledger: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."TrainerNote") AS notes,
      (SELECT count(*) FROM public."TrainerNoteEntry") AS entries,
      (SELECT count(*) FROM public."TrainerNoteStudent") AS links,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger
  `;
}
function exactKeys(rows: unknown[]) {
  for (const row of rows) {
    expect(Object.keys(row as object).sort()).toEqual(["createdAt", "id", "tags", "title"]);
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(JSON.stringify(row)).not.toContain(U.student);
    expect(JSON.stringify(row)).not.toContain(U.trainerA);
  }
}
const read = (actorUserId: string, isAdmin = false, page = 0, pageSize = 2) =>
  readTrainerNotesSummaryApplication.execute({ actorUserId, isAdmin, page, pageSize });

beforeAll(async () => {
  await assertOwnedDB();
  expect(await ownCounts()).toEqual([{ users: 0n, notes: 0n, entries: 0n, links: 0n, ledger: 0n }]);
  await prisma.user.createMany({
    data: actors.map((actor) => ({
      id: actor,
      username: actor,
      password: "fictional-actor-only",
    })),
  });
  seeded = true;
  const rows = [
    {
      id: N.a1,
      trainerId: U.trainerA,
      title: "Early fiction",
      tags: [],
      createdAt: new Date(originalDates.a1),
    },
    {
      id: N.a2,
      trainerId: U.trainerA,
      title: null,
      tags: ["fictional"],
      createdAt: new Date(originalDates.a2),
    },
    {
      id: N.a3,
      trainerId: U.trainerA,
      title: "Third",
      tags: ["practice", "dog"],
      createdAt: new Date(originalDates.a3),
    },
    {
      id: N.a4,
      trainerId: U.trainerA,
      title: "Fourth",
      tags: [],
      createdAt: new Date(originalDates.a4),
    },
    {
      id: N.a5,
      trainerId: U.trainerA,
      title: "Latest",
      tags: ["two"],
      createdAt: new Date(originalDates.a5),
    },
    {
      id: N.b1,
      trainerId: U.trainerB,
      title: "B older",
      tags: ["other"],
      createdAt: new Date(originalDates.b1),
    },
    {
      id: N.b2,
      trainerId: U.trainerB,
      title: "B newest",
      tags: [],
      createdAt: new Date(originalDates.b2),
    },
  ];
  await prisma.trainerNote.createMany({ data: rows });
  await prisma.trainerNoteEntry.create({
    data: {
      id: entryId,
      noteId: N.a5,
      content: secret,
      order: 0,
      isVisibleToStudent: true,
    },
  });
  await prisma.trainerNoteStudent.create({
    data: {
      id: assignmentId,
      noteId: N.a5,
      studentId: U.student,
    },
  });
}, 45000);

afterAll(async () => {
  try {
    await assertOwnedDB();
    if (seeded) {
      await prisma.trainerNoteStudent.deleteMany({ where: { id: assignmentId } });
      await prisma.trainerNoteEntry.deleteMany({ where: { id: entryId } });
      await prisma.trainerNote.deleteMany({ where: { id: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: actors } } });
    }
    expect(await ownCounts()).toEqual([
      { users: 0n, notes: 0n, entries: 0n, links: 0n, ledger: 0n },
    ]);
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

describe("AG1 Trainer Notes original repository/application on real production-shaped PG18", () => {
  it("empty owner returns genuine zero; out-of-range page preserves own total", async () => {
    const empty = await read(U.empty);
    expect(empty).toEqual({ notes: [], total: 0, page: 0, pageSize: 2 });
    const page = await read(U.trainerA, false, 4, 2);
    expect(page).toEqual({ notes: [], total: 5, page: 4, pageSize: 2 });
    const strict = await readTrainerNotesSummarySnapshot({ trainerId: U.empty }, 0, 50);
    expect(strict).toEqual({ notes: [], total: 0 });
  });
  it("A: real SQL page 0/1/2 ordered by createdAt desc, exact nullable title/tags/date whitelist", async () => {
    const pages = await Promise.all([
      read(U.trainerA),
      read(U.trainerA, false, 1),
      read(U.trainerA, false, 2),
    ]);
    for (const [i, page] of pages.entries()) {
      expect(page.page).toBe(i);
      expect(page.pageSize).toBe(2);
      expect(page.total).toBe(5);
      exactKeys(page.notes);
    }
    expect(pages.map((x) => x.notes.map((n) => n.id))).toEqual([
      [N.a5, N.a4],
      [N.a3, N.a2],
      [N.a1],
    ]);
    expect(pages[1]?.notes[1]).toEqual({
      id: N.a2,
      title: null,
      tags: ["fictional"],
      createdAt: originalDates.a2,
    });
    expect(pages[0]?.notes[0]).toEqual({
      id: N.a5,
      title: "Latest",
      tags: ["two"],
      createdAt: originalDates.a5,
    });
  });
  it("B isolated from A; admin requested by existing application has all owner notes, no sensitive relations", async () => {
    const b = await read(U.trainerB, false, 0, 50);
    expect(b.total).toBe(2);
    expect(b.notes.map((n) => n.id)).toEqual([N.b2, N.b1]);
    exactKeys(b.notes);
    const admin = await read(U.trainerA, true, 0, 50);
    expect(admin.total).toBe(7);
    expect(admin.notes.map((n) => n.id)).toEqual([N.b2, N.a5, N.a4, N.a3, N.a2, N.a1, N.b1]);
    exactKeys(admin.notes);
    const limited = await readTrainerNotesSummarySnapshot({ trainerId: U.trainerB }, 1, 1);
    expect(limited.total).toBe(2);
    expect(limited.notes.map((x) => x.id)).toEqual([N.b1]);
  });
  it("real Prisma RepeatableRead session holds snapshot across concurrent committed own insert", async () => {
    const result = await read(U.trainerA, false, 0, 50);
    expect(result.total).toBe(5);
    exactKeys(result.notes);
    const checks = await prisma.$queryRaw<
      { notes: bigint; entries: bigint; links: bigint; changed: bigint }[]
    >`
      SELECT (SELECT count(*) FROM public."TrainerNote") AS notes,
        (SELECT count(*) FROM public."TrainerNoteEntry") AS entries,
        (SELECT count(*) FROM public."TrainerNoteStudent") AS links,
        (SELECT count(*) FROM public."TrainerNote" WHERE "createdAt" >
            TIMESTAMPTZ '2026-10-26T00:00:00Z') AS changed
    `;
    expect(checks).toEqual([{ notes: 7n, entries: 1n, links: 1n, changed: 0n }]);
    // This is an independent *real PostgreSQL session isolation probe*, not
    // a mock of the target repository transaction. Its actual source uses
    // exactly the same Prisma transaction isolation option "RepeatableRead".
    const held = await prisma.$transaction(
      async (tx) => {
        const settings = await tx.$queryRaw<{ isolation: string }[]>`
        SELECT current_setting('transaction_isolation') AS isolation
      `;
        expect(settings).toEqual([{ isolation: "repeatable read" }]);
        const first = await tx.trainerNote.count({ where: { trainerId: U.trainerA } });
        expect(first).toBe(5);
        // A different pool connection commits a scoped fictional row AFTER
        // this transaction's first statement established the snapshot.
        await prisma.trainerNote.create({
          data: {
            id: N.snapshotNew,
            trainerId: U.trainerA,
            title: "Concurrent isolated fixture",
            tags: [],
            createdAt: new Date("2026-10-26T10:00:00.000Z"),
          },
        });
        const second = await tx.trainerNote.count({ where: { trainerId: U.trainerA } });
        return { first, second };
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
    expect(held).toEqual({ first: 5, second: 5 });
    try {
      const nowVisible = await read(U.trainerA, false, 0, 50);
      expect(nowVisible.total).toBe(6);
      expect(nowVisible.notes[0]?.id).toBe(N.snapshotNew);
      exactKeys(nowVisible.notes);
    } finally {
      await prisma.trainerNote.deleteMany({ where: { id: N.snapshotNew } });
    }
    expect((await read(U.trainerA, false, 0, 50)).total).toBe(5);
  });
});
