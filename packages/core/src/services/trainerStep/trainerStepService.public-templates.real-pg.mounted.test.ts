/** AG1-001/TR013: existing public templates composition → original Core → real owned PG18. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { readPublicTemplatesApplication } from "../../../../../apps/api/src/modules/trainer-templates/composition/read-public-templates";

// Original trainerStepService also imports write-only cache/revision ports.
// They must fail closed if any supposedly read-only path reaches them.
const forbidden = vi.hoisted(() => ({
  invalidate: vi.fn(() => {
    throw Error("TEMPLATE_WRITE_CACHE_FORBIDDEN");
  }),
  publish: vi.fn(() => {
    throw Error("TEMPLATE_WRITE_REVISION_FORBIDDEN");
  }),
}));
vi.mock("../training/trainingDayContent", () => ({
  invalidateStepsContentCache: forbidden.invalidate,
}));
vi.mock("../training/trainingContentRevision", () => ({
  publishCourseContentChange: forbidden.publish,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));

const database = "gafus_refactor_public_templates_ag1_20261024";
const directory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_tr013_public_templates_sql_20261024";
const prefix = "ag1_tr013_templates_pg18_20261024_";
const id = (suffix: string) => prefix + suffix;
const f = {
  a: id("author_a"),
  b: id("author_b"),
  catA: id("category_a"),
  catB: id("category_b"),
  highest: id("template_highest"),
  tieNew: id("template_tie_new"),
  tieOld: id("template_tie_old"),
  uncategorized: id("template_uncategorized"),
  categoryB: id("template_category_b"),
  hidden: id("template_private_hidden"),
};
const actors = [f.a, f.b];
const cats = [f.catA, f.catB];
const templates = [f.highest, f.tieNew, f.tieOld, f.uncategorized, f.categoryB, f.hidden];
const stamp = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`);
const opaque = "opaque-fictional://not-fetched";
const privateMarker = "PRIVATE_CATEGORY_DESCRIPTION_NOT_A_PUBLIC_FIELD";
const read = (categoryId: string | undefined) =>
  readPublicTemplatesApplication.execute({ categoryId });
let seeded = false;

async function guardOwnDatabase() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_TEMPLATES_OWN_PG18).toBe("1");
  expect([
    u.protocol,
    u.hostname,
    u.port,
    u.pathname,
    u.searchParams.get("host"),
    u.searchParams.get("application_name"),
    u.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, socket, appTag, ""]);
  const rows = await prisma.$queryRaw<
    {
      db: boolean;
      version: boolean;
      directory: boolean;
      sock: boolean;
      unix: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${directory} AS directory,
      current_setting('unix_socket_directories')=${socket} AS sock,
      current_setting('listen_addresses')='' AS unix,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
          OR application_name IS DISTINCT FROM ${appTag})) AS outsiders
  `;
  expect(rows).toEqual([
    {
      db: true,
      version: true,
      directory: true,
      sock: true,
      unix: true,
      outsiders: 0n,
    },
  ]);
}

beforeAll(async () => {
  await guardOwnDatabase();
  expect(
    await prisma.$queryRaw<{ u: bigint; c: bigint; t: bigint; m: bigint }[]>`
    SELECT (SELECT count(*) FROM public."User") AS u,
      (SELECT count(*) FROM public."StepCategory") AS c,
      (SELECT count(*) FROM public."StepTemplate") AS t,
      (SELECT count(*) FROM public._prisma_migrations) AS m
  `,
  ).toEqual([{ u: 0n, c: 0n, t: 0n, m: 0n }]);
  seeded = true;
  await prisma.user.createMany({
    data: actors.map((a) => ({
      id: a,
      username: a,
      password: "fictional-only-secret-not-projected",
    })),
  });
  await prisma.stepCategory.createMany({
    data: [
      {
        id: f.catA,
        name: "A fictional course category",
        icon: "paw",
        description: privateMarker,
        order: 1,
      },
      { id: f.catB, name: "B fictional course category", icon: null, order: 2 },
    ],
  });
  await prisma.stepTemplate.createMany({
    data: [
      {
        id: f.highest,
        authorId: f.a,
        categoryId: f.catA,
        title: "Most used public",
        description: "Public fictional description",
        type: "TRAINING",
        isPublic: true,
        usageCount: 12,
        createdAt: stamp(20),
        updatedAt: stamp(22),
        durationSec: 180,
        imageUrls: [opaque + "/image"],
        pdfUrls: [opaque + "/pdf"],
        videoUrl: opaque + "/video",
        checklist: { title: "fictional", items: ["one", "two"] },
        requiresVideoReport: true,
        requiresWrittenFeedback: true,
        hasTestQuestions: true,
        surveySlug: "fictional-survey",
        tags: ["training", "fictional"],
        estimatedDurationSec: 200,
      },
      {
        id: f.tieNew,
        authorId: f.b,
        categoryId: f.catA,
        title: "Same usage newer",
        type: "PRACTICE",
        isPublic: true,
        usageCount: 9,
        createdAt: stamp(23),
        updatedAt: stamp(23),
        durationSec: null,
        videoUrl: null,
        checklist: { items: [] },
        tags: [],
      },
      {
        id: f.tieOld,
        authorId: f.a,
        categoryId: f.catA,
        title: "Same usage older",
        type: "THEORY",
        isPublic: true,
        usageCount: 9,
        createdAt: stamp(19),
        updatedAt: stamp(24),
      },
      {
        id: f.uncategorized,
        authorId: f.b,
        categoryId: null,
        title: "No category public",
        type: "BREAK",
        isPublic: true,
        usageCount: 7,
        createdAt: stamp(21),
        updatedAt: stamp(21),
      },
      {
        id: f.categoryB,
        authorId: f.b,
        categoryId: f.catB,
        title: "Other category public",
        type: "SURVEY",
        isPublic: true,
        usageCount: 5,
        createdAt: stamp(24),
        updatedAt: stamp(24),
      },
      {
        id: f.hidden,
        authorId: f.a,
        categoryId: f.catA,
        title: "Private never returned",
        type: "EXAMINATION",
        isPublic: false,
        usageCount: 99,
        createdAt: stamp(25),
        updatedAt: stamp(25),
        tags: ["confidential"],
        description: "Private template body not to return",
      },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await guardOwnDatabase();
    if (seeded) {
      await prisma.stepTemplate.deleteMany({ where: { id: { in: templates } } });
      await prisma.stepCategory.deleteMany({ where: { id: { in: cats } } });
      await prisma.user.deleteMany({ where: { id: { in: actors } } });
    }
    expect(
      await prisma.$queryRaw<{ u: bigint; c: bigint; t: bigint; m: bigint }[]>`
      SELECT (SELECT count(*) FROM public."User") AS u,
        (SELECT count(*) FROM public."StepCategory") AS c,
        (SELECT count(*) FROM public."StepTemplate") AS t,
        (SELECT count(*) FROM public._prisma_migrations) AS m
    `,
    ).toEqual([{ u: 0n, c: 0n, t: 0n, m: 0n }]);
    expect(forbidden.invalidate).not.toHaveBeenCalled();
    expect(forbidden.publish).not.toHaveBeenCalled();
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

const templateKeys = [
  "id",
  "title",
  "description",
  "durationSec",
  "type",
  "imageUrls",
  "pdfUrls",
  "videoUrl",
  "checklist",
  "requiresVideoReport",
  "requiresWrittenFeedback",
  "hasTestQuestions",
  "surveySlug",
  "tags",
  "isPublic",
  "usageCount",
  "category",
  "author",
  "createdAt",
];
const exactKeys = (row: Record<string, unknown>, expected: string[]) =>
  expect(Object.keys(row).sort()).toEqual([...expected].sort());

describe("AG1 original public step templates Core Prisma PG18", () => {
  it("Core SQL public-only and original popularity/createdAt descending sort across authors", async () => {
    const all = await read(undefined);
    expect(all.map((x) => x.id)).toEqual([
      f.highest,
      f.tieNew,
      f.tieOld,
      f.uncategorized,
      f.categoryB,
    ]);
    expect(all.map((x) => x.usageCount)).toEqual([12, 9, 9, 7, 5]);
    expect(all.map((x) => x.author.id)).toEqual([f.a, f.b, f.a, f.b, f.b]);
    for (const x of all) {
      exactKeys(x, templateKeys);
      expect(x.isPublic).toBe(true);
      expect(x.createdAt).toMatch(/^2026-10-\d{2}T10:00:00\.000Z$/);
      expect(JSON.stringify(x)).not.toContain(privateMarker);
      expect(JSON.stringify(x)).not.toContain("Private template body");
      expect(JSON.stringify(x)).not.toContain("fictional-only-secret");
    }
    expect(await prisma.stepTemplate.count()).toBe(templates.length);
  });
  it("optional categoryId, null category, empty and missing category cases", async () => {
    expect((await read(f.catA)).map((x) => x.id)).toEqual([f.highest, f.tieNew, f.tieOld]);
    expect((await read(f.catB)).map((x) => x.id)).toEqual([f.categoryB]);
    expect(await read("fictional_missing_category")).toEqual([]);
    expect((await read(undefined)).find((x) => x.id === f.uncategorized)?.category).toBeNull();
    expect((await read("")).map((x) => x.id)).toEqual([
      f.highest,
      f.tieNew,
      f.tieOld,
      f.uncategorized,
      f.categoryB,
    ]);
    expect((await read(f.catA)).every((x) => x.category?.id === f.catA)).toBe(true);
  });
  it("exact category and author relation whitelist; null icon and media nullable", async () => {
    const all = await read(undefined);
    const highest = all[0]!;
    expect(highest.category).toEqual({
      id: f.catA,
      name: "A fictional course category",
      icon: "paw",
    });
    expect(all.at(-1)?.category).toEqual({
      id: f.catB,
      name: "B fictional course category",
      icon: null,
    });
    for (const item of all) {
      exactKeys(item.author, ["id", "username"]);
      if (item.category !== null) exactKeys(item.category, ["id", "name", "icon"]);
    }
    expect(highest.author).toEqual({ id: f.a, username: f.a });
    expect(highest.durationSec).toBe(180);
    expect(all[1]?.durationSec).toBeNull();
    expect(all[1]?.videoUrl).toBeNull();
    expect(all[1]?.imageUrls).toEqual([]);
    expect(all[1]?.pdfUrls).toEqual([]);
    expect(all[2]?.checklist).toBeNull();
    expect(highest.estimatedDurationSec).toBeUndefined();
  });
  it("real JSON/checklist and unchanged opaque media/flags, no provider or write execution", async () => {
    const highest = (await read(f.catA))[0]!;
    expect(highest.videoUrl).toBe(opaque + "/video");
    expect(highest.imageUrls).toEqual([opaque + "/image"]);
    expect(highest.pdfUrls).toEqual([opaque + "/pdf"]);
    expect(highest.checklist).toEqual({ title: "fictional", items: ["one", "two"] });
    expect(highest.tags).toEqual(["training", "fictional"]);
    expect(highest.surveySlug).toBe("fictional-survey");
    expect(highest).toMatchObject({
      requiresVideoReport: true,
      requiresWrittenFeedback: true,
      hasTestQuestions: true,
    });
    expect(await prisma.stepTemplate.count()).toBe(templates.length);
    expect(forbidden.invalidate).not.toHaveBeenCalled();
    expect(forbidden.publish).not.toHaveBeenCalled();
  });
});
