/** INFRA032: exact own PG18 schema clone and fictional StudentNotes READ acceptance. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { getStudentNotes } from "./notesService";
import { createReadStudentNotesApplication } from "../../../../../apps/api/src/modules/student-notes/application/read-student-notes";

const pushAttempt = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("NOTIFICATION_PORT_MUST_NOT_BE_CALLED");
  }),
);
vi.mock("@gafus/core/services/notifications", () => ({
  createImmediatePushNotification: pushAttempt,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));

const database = "gafus_refactor_notes_real_sql_ag1_20261024";
const dataDirectory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const namespace = "ag1notes_real_sql_20261024_";
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
  expect(process.env.G1_AG1_NOTES_OWN_PG18).toBe("1");
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
       WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()) AS peers
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

describe("INFRA032 existing Core StudentNotes via real Prisma and owned PG18", () => {
  it("A sees only assigned notes with visible entries, note-desc/entry-asc and private trainer projection", async () => {
    const result = await getStudentNotes(fixture.studentA);
    expect(result.map((note) => note.id)).toEqual([fixture.newest, fixture.older]);
    expect(result.map((note) => note.entries.map((entry) => entry.content))).toEqual([
      ["old visible", "new visible"],
      ["older visible"],
    ]);
    expect(result.every((note) => note.entries.every((entry) => entry.isVisibleToStudent))).toBe(
      true,
    );
    expect(result[0]?.tags).toEqual(["fictional"]);
    expect(result[1]?.title).toBe(null);
    expect(result[0]?.trainer).toEqual({
      id: fixture.trainer,
      username: fixture.trainer,
      profile: { fullName: "Fictional Trainer", avatarUrl: null },
    });
    expect(Object.keys(result[0] ?? {}).sort()).toEqual([
      "createdAt",
      "entries",
      "id",
      "tags",
      "title",
      "trainer",
    ]);
    expect(result[0]?.createdAt).toBeInstanceOf(Date);
    const serialized = JSON.parse(JSON.stringify(result));
    expect(serialized[0]?.createdAt).toBe("2031-03-03T10:00:00.000Z");
    expect(serialized[0]?.entries?.[0]?.createdAt).toBe("2031-03-06T10:00:00.000Z");
    expect(serialized[0]?.entries?.[0]?.updatedAt).toBe("2031-03-07T10:00:00.000Z");
    expect(pushAttempt).not.toHaveBeenCalled();
  });

  it("B sees only B's own association, not A's or the unassigned/publicly seeded notes", async () => {
    const result = await getStudentNotes(fixture.studentB);
    expect(result.map((note) => note.id)).toEqual([fixture.onlyB]);
    expect(result[0]?.entries.map((entry) => entry.content)).toEqual(["B only visible"]);
    expect(pushAttempt).not.toHaveBeenCalled();
  });

  it("unassigned C gets empty []; existing API application port delegates actual Core read", async () => {
    const app = createReadStudentNotesApplication({ readNotes: getStudentNotes });
    expect(await app.execute(fixture.studentC)).toEqual([]);
    expect((await app.execute(fixture.studentA)).map((note) => note.id)).toEqual([
      fixture.newest,
      fixture.older,
    ]);
    expect(pushAttempt).not.toHaveBeenCalled();
  });
});
