/** AG1 COURSE030: original trainer own article metadata read with true PG18 tie/cutoff. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { readTrainerOwnArticleMetadataRows } from "./read-own-article-metadata-rows";
import { createReadTrainerOwnArticleMetadataApplication } from "../application/read-own-article-metadata";

const database = "gafus_refactor_trainer_article_cutoff_ag1_20261024";
const dataDir =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_course030_article_cutoff_20261024";
const prefix = "ag1_article_cutoff_20261024_";
const id = (name: string) => prefix + name;
const F = { a: id("author_a"), b: id("author_b"), empty: id("empty_actor") };
const actors = [F.a, F.b, F.empty];
const sameCreatedAt = new Date("2032-07-04T10:00:00.000Z");
const sameUpdatedAt = new Date("2032-07-05T11:12:13.000Z");
const secret = "SYNTHETIC_PRIVATE_CONTENT_NOT_IN_METADATA";
const ownIds = Array.from({ length: 101 }, (_, i) => id(`a_${String(i).padStart(3, "0")}`));
const otherId = id("b_one");
const allIds = [...ownIds, otherId];
const metadataKeys = [
  "createdAt",
  "id",
  "likeCount",
  "slug",
  "title",
  "updatedAt",
  "viewCount",
  "visibility",
].sort();
const read = createReadTrainerOwnArticleMetadataApplication({
  readRows: readTrainerOwnArticleMetadataRows,
});
let seeded = false;

async function ownDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_ARTICLE_CUTOFF_OWN_PG18).toBe("1");
  expect([
    url.protocol,
    url.hostname,
    url.port,
    url.pathname,
    url.searchParams.get("host"),
    url.searchParams.get("application_name"),
    url.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, socket, appTag, ""]);
  const rows = await prisma.$queryRaw<
    {
      db: boolean;
      version: boolean;
      directory: boolean;
      unix: boolean;
      socket: boolean;
      otherClients: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${dataDir} AS directory,
      current_setting('listen_addresses')='' AS unix,
      current_setting('unix_socket_directories')=${socket} AS socket,
      (SELECT count(*) FROM pg_stat_activity
        WHERE backend_type='client backend' AND pid<>pg_backend_pid()
          AND (datname IS DISTINCT FROM ${database}
            OR application_name IS DISTINCT FROM ${appTag})) AS "otherClients"
  `;
  expect(rows).toEqual([
    { db: true, version: true, directory: true, unix: true, socket: true, otherClients: 0n },
  ]);
}

beforeAll(async () => {
  await ownDatabase();
  const count = await prisma.$queryRaw<
    { users: bigint; articles: bigint; likes: bigint; ledger: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."Article") AS articles,
      (SELECT count(*) FROM public."ArticleLike") AS likes,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger
  `;
  expect(count).toEqual([{ users: 0n, articles: 0n, likes: 0n, ledger: 0n }]);
  await prisma.user.createMany({
    data: actors.map((actor) => ({
      id: actor,
      username: actor,
      password: "fictional-only",
    })),
  });
  seeded = true;
  await prisma.article.createMany({
    data: [
      ...ownIds.map((articleId, idx) => ({
        id: articleId,
        authorId: F.a,
        title: `Fictional article ${idx}`,
        slug: articleId,
        createdAt: sameCreatedAt,
        updatedAt: sameUpdatedAt,
        content: secret,
        description: secret,
        logoImg: secret,
        videoUrl: secret,
        imageUrls: [secret],
        visibility: idx % 2 === 0 ? ("PUBLIC" as const) : ("PAID" as const),
        viewCount: idx,
        contentType: "HTML" as const,
      })),
      {
        id: otherId,
        authorId: F.b,
        title: "Other author fictional article",
        slug: otherId,
        createdAt: sameCreatedAt,
        updatedAt: sameUpdatedAt,
        content: secret,
        description: secret,
        logoImg: secret,
        videoUrl: secret,
        imageUrls: [secret],
        visibility: "PAID" as const,
        viewCount: 777,
        contentType: "HTML" as const,
      },
    ],
  });
  await prisma.articleLike.createMany({
    data: [
      { articleId: ownIds[100]!, userId: F.b },
      { articleId: ownIds[100]!, userId: F.empty },
      { articleId: ownIds[50]!, userId: F.b },
      { articleId: ownIds[0]!, userId: F.empty },
      { articleId: otherId, userId: F.a },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await ownDatabase();
    if (seeded) {
      await prisma.articleLike.deleteMany({ where: { articleId: { in: allIds } } });
      await prisma.article.deleteMany({ where: { id: { in: allIds } } });
      await prisma.user.deleteMany({ where: { id: { in: actors } } });
    }
    const zero = await prisma.$queryRaw<
      { users: bigint; articles: bigint; likes: bigint; ledger: bigint }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."Article") AS articles,
        (SELECT count(*) FROM public."ArticleLike") AS likes,
        (SELECT count(*) FROM public._prisma_migrations) AS ledger
    `;
    expect(zero).toEqual([{ users: 0n, articles: 0n, likes: 0n, ledger: 0n }]);
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

describe("COURSE030 original own-articles repository and application real PG18", () => {
  it("empty independent actor returns [] without leaking A or B", async () => {
    expect(await readTrainerOwnArticleMetadataRows(F.empty)).toEqual([]);
    expect(await read.execute({ actorUserId: F.empty })).toEqual({ articles: [] });
  });

  it("101 identical createdAt values: DB id DESC tie-break keeps exact first 100 and excludes 101st", async () => {
    expect(await prisma.article.count({ where: { authorId: F.a } })).toBe(101);
    expect(await prisma.article.count({ where: { authorId: F.b } })).toBe(1);
    const rows = await readTrainerOwnArticleMetadataRows(F.a);
    const expected = ownIds.slice(1).reverse();
    expect(rows).toHaveLength(100);
    expect(rows.map((row) => row.id)).toEqual(expected);
    expect(rows.some((row) => row.id === ownIds[0])).toBe(false);
    expect(
      rows.every(
        (row) =>
          row.createdAt instanceof Date && row.createdAt.getTime() === sameCreatedAt.getTime(),
      ),
    ).toBe(true);
    expect(rows[0]?.id).toBe(ownIds[100]);
    expect(rows[99]?.id).toBe(ownIds[1]);
  });

  it("actual SQL likes and application ISO eight-field whitelist, no content/author relations", async () => {
    const { articles } = await read.execute({ actorUserId: F.a });
    expect(articles).toHaveLength(100);
    expect(articles.map((row) => row.id)).toEqual(ownIds.slice(1).reverse());
    for (const row of articles) {
      expect(Object.keys(row).sort()).toEqual(metadataKeys);
      expect(row.slug).toBe(row.id);
      expect(row.createdAt).toBe(sameCreatedAt.toISOString());
      expect(row.updatedAt).toBe(sameUpdatedAt.toISOString());
      expect(row.viewCount).toBe(Number(row.id.slice(-3)));
      expect(row.visibility).toBe(Number(row.id.slice(-3)) % 2 === 0 ? "PUBLIC" : "PAID");
    }
    expect(articles[0]?.likeCount).toBe(2);
    expect(articles.find((row) => row.id === ownIds[50])?.likeCount).toBe(1);
    expect(articles.find((row) => row.id === ownIds[1])?.likeCount).toBe(0);
    expect(JSON.stringify(articles)).not.toContain(secret);
    expect(JSON.stringify(articles)).not.toContain(F.a);
    expect(JSON.stringify(articles)).not.toContain(F.b);
    const again = await read.execute({ actorUserId: F.a });
    expect(again).toEqual({ articles });
    expect(await prisma.articleLike.count({ where: { articleId: ownIds[0] } })).toBe(1);
  });

  it("other author only sees own one record and real SQL like count", async () => {
    const ownB = await read.execute({ actorUserId: F.b });
    expect(ownB.articles).toHaveLength(1);
    expect(ownB.articles[0]).toMatchObject({
      id: otherId,
      title: "Other author fictional article",
      visibility: "PAID",
      viewCount: 777,
      likeCount: 1,
      createdAt: sameCreatedAt.toISOString(),
      updatedAt: sameUpdatedAt.toISOString(),
    });
    expect(Object.keys(ownB.articles[0]!).sort()).toEqual(metadataKeys);
    expect(JSON.stringify(ownB)).not.toContain(secret);
    expect(ownB.articles.some((row) => row.id.startsWith(id("a_")))).toBe(false);
  });
});
