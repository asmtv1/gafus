/** AG1 COURSE030: original tied-createdAt offset READ with real Prisma + private PG18. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { readTrainerNotesSummarySnapshot } from "./read-notes-summary-snapshot";
import { readTrainerNotesSummaryApplication } from "../composition/read-notes-summary";

const database = "gafus_refactor_trainer_notes_tie_ag1_20261024";
const dataDir =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appName = "ag1_trainer_notes_tie_real_pg18_20261024";
const prefix = "ag1_notes_tie_pg18_20261024_";
const ident = (name: string) => prefix + name;
const actorA = ident("trainer_a");
const actorB = ident("trainer_b");
const actorEmpty = ident("trainer_empty");
const actors = [actorA, actorB, actorEmpty];
const newest = ident("note_newest");
const oldest = ident("note_oldest");
const tied = Array.from({ length: 10 }, (_, i) => ident(`note_tie_${String(i).padStart(3, "0")}`));
const foreign = [ident("foreign_b_01"), ident("foreign_b_02")];
const ownNotes = [newest, ...tied, oldest];
const allNotes = [...ownNotes, ...foreign];
const sharedDate = new Date("2026-10-22T12:30:00.000Z");
const iso = (d: Date) => d.toISOString();
const dateNew = new Date("2026-10-23T12:30:00.000Z");
const dateOld = new Date("2026-10-21T12:30:00.000Z");
let seeded = false;

async function ownDB() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_TRAINER_NOTES_TIE_REAL_PG18).toBe("1");
  expect([
    url.protocol,
    url.hostname,
    url.port,
    url.pathname,
    url.searchParams.get("host"),
    url.searchParams.get("application_name"),
    url.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, socket, appName, ""]);
  const rows = await prisma.$queryRaw<
    { db: boolean; ver: boolean; dir: boolean; tcp: boolean; sock: boolean; outsiders: bigint }[]
  >`
      SELECT current_database()=${database} AS db,
        current_setting('server_version_num')='180004' AS ver,
        current_setting('data_directory')=${dataDir} AS dir,
        current_setting('listen_addresses')='' AS tcp,
        current_setting('unix_socket_directories')=${socket} AS sock,
        (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
         AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
         OR application_name IS DISTINCT FROM ${appName})) AS outsiders
    `;
  expect(rows).toEqual([{ db: true, ver: true, dir: true, tcp: true, sock: true, outsiders: 0n }]);
}

const view = (owner: string, page = 0, pageSize = 4) =>
  readTrainerNotesSummaryApplication.execute({
    actorUserId: owner,
    isAdmin: false,
    page,
    pageSize,
  });
const keys = (x: object) => Object.keys(x).sort();

beforeAll(async () => {
  await ownDB();
  const empty = await prisma.$queryRaw<{ users: bigint; notes: bigint; ledger: bigint }[]>`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."TrainerNote") AS notes,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger
  `;
  expect(empty).toEqual([{ users: 0n, notes: 0n, ledger: 0n }]);
  await prisma.user.createMany({
    data: actors.map((actor) => ({
      id: actor,
      username: actor,
      password: "fictional-only",
    })),
  });
  seeded = true;
  // Intentionally insert in a different order from expected SQL id DESC, all
  // 10 middle rows share an EXACT timestamp and cross two page boundaries.
  // Do not rely on the insertion order or timestamps to break tied primary keys.
  const values = tied.map((tid, i) => ({
    id: tid,
    trainerId: actorA,
    createdAt: sharedDate,
    title: i === 5 ? null : `fictional tied ${i}`,
    tags: i === 5 ? ["fictional", "nullable"] : i === 9 ? [] : ["fictional"],
  }));
  const sortedInsertion = [
    values[2]!,
    values[0]!,
    values[7]!,
    values[4]!,
    values[9]!,
    values[1]!,
    values[6]!,
    values[3]!,
    values[8]!,
    values[5]!,
  ];
  await prisma.trainerNote.createMany({
    data: [
      sortedInsertion[0]!,
      {
        id: oldest,
        trainerId: actorA,
        title: "fictional oldest",
        tags: ["historical"],
        createdAt: dateOld,
      },
      ...sortedInsertion.slice(1, 5),
      {
        id: foreign[0]!,
        trainerId: actorB,
        title: "fictional foreign one",
        tags: [],
        createdAt: dateNew,
      },
      { id: newest, trainerId: actorA, title: "fictional newest", tags: [], createdAt: dateNew },
      ...sortedInsertion.slice(5),
      { id: foreign[1]!, trainerId: actorB, title: null, tags: ["foreign"], createdAt: dateOld },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await ownDB();
    if (seeded) {
      await prisma.trainerNote.deleteMany({ where: { id: { in: allNotes } } });
      await prisma.user.deleteMany({ where: { id: { in: actors } } });
    }
    const empty = await prisma.$queryRaw<
      { users: bigint; notes: bigint; entries: bigint; links: bigint; ledger: bigint }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."TrainerNote") AS notes,
        (SELECT count(*) FROM public."TrainerNoteEntry") AS entries,
        (SELECT count(*) FROM public."TrainerNoteStudent") AS links,
        (SELECT count(*) FROM public._prisma_migrations) AS ledger
    `;
    expect(empty).toEqual([{ users: 0n, notes: 0n, entries: 0n, links: 0n, ledger: 0n }]);
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

describe("AG1 real tied-createdAt TrainerNote SQL orderBy secondary id DESC", () => {
  it("adjacent pages0/1/last are exactly nonoverlapping id DESC at tied timestamps", async () => {
    const page0 = await view(actorA, 0);
    const page1 = await view(actorA, 1);
    const page2 = await view(actorA, 2);
    const pages = [page0, page1, page2];
    for (const [i, p] of pages.entries()) {
      expect(p).toMatchObject({ page: i, pageSize: 4, total: 12 });
      expect(p.notes).toHaveLength(4);
      for (const note of p.notes) {
        expect(keys(note)).toEqual(["createdAt", "id", "tags", "title"]);
        expect(typeof note.createdAt).toBe("string");
        expect(note.createdAt).not.toContain(actorA);
        expect(note).not.toHaveProperty("trainerId");
        expect(note).not.toHaveProperty("entries");
        expect(note).not.toHaveProperty("students");
        expect(note).not.toHaveProperty("trainer");
        expect(JSON.stringify(note)).not.toContain(actorB);
      }
    }
    const got = pages.flatMap((p) => p.notes.map((n) => n.id));
    const expected = [newest, ...tied.slice().reverse(), oldest];
    expect(got).toEqual(expected);
    expect(new Set(got).size).toBe(12);
    expect(got.filter((x) => foreign.includes(x))).toEqual([]);
    expect((await view(actorA, 1)).notes.map((n) => n.id)).toEqual(expected.slice(4, 8));
    expect(page0.notes[0]?.createdAt).toBe(iso(dateNew));
    expect(page0.notes[1]?.createdAt).toBe(iso(sharedDate));
    expect(page2.notes[3]?.createdAt).toBe(iso(dateOld));
    const nullTitle = pages.flatMap((p) => p.notes).find((n) => n.id === tied[5]);
    expect(nullTitle).toEqual({
      id: tied[5],
      title: null,
      tags: ["fictional", "nullable"],
      createdAt: iso(sharedDate),
    });
  });

  it("owner B isolated, empty owner and after-last A page return true totals", async () => {
    const b = await view(actorB, 0, 4);
    expect(b.total).toBe(2);
    expect(b.notes.map((n) => n.id)).toEqual([foreign[0], foreign[1]]);
    expect(b.notes.map((n) => n.title)).toEqual(["fictional foreign one", null]);
    b.notes.forEach((n) => expect(keys(n)).toEqual(["createdAt", "id", "tags", "title"]));
    expect(await view(actorEmpty)).toEqual({ notes: [], total: 0, page: 0, pageSize: 4 });
    expect(await view(actorA, 3)).toEqual({ notes: [], total: 12, page: 3, pageSize: 4 });
  });

  it("real repository keeps Date-domain nullable select and exact same stable page1", async () => {
    const snapshot = await readTrainerNotesSummarySnapshot({ trainerId: actorA }, 1, 4);
    expect(snapshot.total).toBe(12);
    expect(snapshot.notes.map((n) => n.id)).toEqual(tied.slice().reverse().slice(3, 7));
    for (const note of snapshot.notes) {
      expect(keys(note)).toEqual(["createdAt", "id", "tags", "title"]);
      expect(note.createdAt).toBeInstanceOf(Date);
      expect(note.createdAt.toISOString()).toBe(iso(sharedDate));
    }
    expect(await prisma.trainerNote.count({ where: { trainerId: actorA } })).toBe(12);
    expect(await prisma.trainerNote.count({ where: { trainerId: actorB } })).toBe(2);
  });
});
