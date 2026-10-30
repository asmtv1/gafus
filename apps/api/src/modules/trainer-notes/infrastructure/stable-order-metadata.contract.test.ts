/** AG1 trainer READ: actual repositories' orderBy against fixed in-memory Prisma-query boundary. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  notesFind: vi.fn(),
  notesCount: vi.fn(),
  transaction: vi.fn(),
  articlesFind: vi.fn(),
}));

// The repositories and their query shapes are real. Only the Prisma boundary is
// synthetic: this is NOT a real-PostgreSQL or concurrent-mutation test.
vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: m.transaction,
    article: { findMany: m.articlesFind },
  },
}));
import { readTrainerNotesSummarySnapshot } from "./read-notes-summary-snapshot";
import { readTrainerOwnArticleMetadataRows } from "../../trainer-articles/infrastructure/read-own-article-metadata-rows";

type Order = [{ createdAt: "desc" }, { id: "desc" }];
type Note = {
  id: string;
  trainerId: string;
  createdAt: Date;
  title: string | null;
  tags: string[];
};
type Article = {
  id: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  title: string;
  slug: string;
  visibility: "PUBLIC";
  viewCount: number;
  _count: { articleLikes: number };
};
type NotesQuery = {
  where: { trainerId?: string };
  select: Record<string, boolean>;
  orderBy: Order;
  skip: number;
  take: number;
};
type ArticlesQuery = {
  where: { authorId: string };
  orderBy: Order;
  take: number;
  select: Record<string, unknown>;
};
const when = (iso: string) => new Date(iso);
const newer = when("2026-10-24T11:00:00.000Z");
const tied = when("2026-10-23T11:00:00.000Z");
const older = when("2026-10-22T11:00:00.000Z");
const notes: Note[] = [
  { id: "note_new", trainerId: "A", createdAt: newer, title: null, tags: [] },
  ...Array.from({ length: 11 }, (_, i) => ({
    id: `note_${String(i).padStart(3, "0")}`,
    trainerId: "A",
    createdAt: tied,
    title: `A ${i}`,
    tags: ["fictional"],
  })),
  { id: "note_old", trainerId: "A", createdAt: older, title: "old", tags: [] },
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `note_foreign_${i}`,
    trainerId: "B",
    createdAt: newer,
    title: "foreign",
    tags: [],
  })),
];
const articles: Article[] = [
  {
    id: "article_new",
    authorId: "A",
    createdAt: newer,
    updatedAt: newer,
    title: "new",
    slug: "fictional-new",
    visibility: "PUBLIC",
    viewCount: 1,
    _count: { articleLikes: 0 },
  },
  ...Array.from({ length: 106 }, (_, i) => ({
    id: `article_${String(i).padStart(3, "0")}`,
    authorId: "A",
    createdAt: tied,
    updatedAt: tied,
    title: `A ${i}`,
    slug: `fictional-${i}`,
    visibility: "PUBLIC" as const,
    viewCount: i,
    _count: { articleLikes: 0 },
  })),
  {
    id: "article_old",
    authorId: "A",
    createdAt: older,
    updatedAt: older,
    title: "old",
    slug: "fictional-old",
    visibility: "PUBLIC",
    viewCount: 1,
    _count: { articleLikes: 0 },
  },
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `article_foreign_${i}`,
    authorId: "B",
    createdAt: newer,
    updatedAt: newer,
    title: "private other author",
    slug: `foreign-${i}`,
    visibility: "PUBLIC" as const,
    viewCount: 0,
    _count: { articleLikes: 0 },
  })),
];
function sortActualOrder<T extends { createdAt: Date; id: string }>(rows: T[], order: Order) {
  expect(order).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  return [...rows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id, "en"),
  );
}
function project<T extends object>(obj: T, selection: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(selection)
      .filter(([, v]) => v === true || (v !== null && typeof v === "object"))
      .map(([key]) => [key, obj[key as keyof T]]),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) => {
    // Stable fixture snapshot for both queries in one RepeatableRead tx.
    const snapshot = [...notes];
    const tx = {
      trainerNote: {
        findMany: (args: NotesQuery) => {
          m.notesFind(args);
          const ordered = sortActualOrder(
            snapshot.filter((n) => !args.where.trainerId || n.trainerId === args.where.trainerId),
            args.orderBy,
          );
          return Promise.resolve(
            ordered.slice(args.skip, args.skip + args.take).map((n) => project(n, args.select)),
          );
        },
        count: (args: { where: { trainerId?: string } }) => {
          m.notesCount(args);
          return Promise.resolve(
            snapshot.filter((n) => !args.where.trainerId || n.trainerId === args.where.trainerId)
              .length,
          );
        },
      },
    };
    return callback(tx);
  });
  m.articlesFind.mockImplementation((args: ArticlesQuery) => {
    const ordered = sortActualOrder(
      articles.filter((a) => a.authorId === args.where.authorId),
      args.orderBy,
    );
    return Promise.resolve(ordered.slice(0, args.take).map((a) => project(a, args.select)));
  });
});

describe("Original repositories have deterministic unique-ID tie-breaks", () => {
  it("notes with identical createdAt: page 0/1/2 no overlap, gaps or privacy leakage", async () => {
    const read = (page: number) => readTrainerNotesSummarySnapshot({ trainerId: "A" }, page, 5);
    const [p0, p1, p2] = await Promise.all([read(0), read(1), read(2)]);
    const ids = [...p0.notes, ...p1.notes, ...p2.notes].map((n) => n.id);
    const expected = [
      "note_new",
      ...Array.from({ length: 11 }, (_, i) => `note_${String(10 - i).padStart(3, "0")}`),
      "note_old",
    ];
    expect([p0.total, p1.total, p2.total]).toEqual([13, 13, 13]);
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(13);
    expect((await read(1)).notes.map((n) => n.id)).toEqual(p1.notes.map((n) => n.id));
    expect(m.notesFind.mock.calls[0]?.[0]).toEqual({
      where: { trainerId: "A" },
      select: { id: true, title: true, tags: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 5,
    });
    expect(m.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
    for (const row of [...p0.notes, ...p1.notes, ...p2.notes]) {
      expect(Object.keys(row).sort()).toEqual(["createdAt", "id", "tags", "title"]);
      expect(row.id).not.toContain("foreign");
    }
  });
  it("notes foreign-author filter and existing non-tied dates remain ordered", async () => {
    const other = await readTrainerNotesSummarySnapshot({ trainerId: "B" }, 0, 2);
    expect(other.total).toBe(3);
    expect(other.notes.map((n) => n.id)).toEqual(["note_foreign_2", "note_foreign_1"]);
    const empty = await readTrainerNotesSummarySnapshot({ trainerId: "none" }, 0, 5);
    expect(empty).toEqual({ notes: [], total: 0 });
  });
  it("articles tied createdAt >100 stable top-N cutoff, excludes other authors", async () => {
    const first = await readTrainerOwnArticleMetadataRows("A");
    const again = await readTrainerOwnArticleMetadataRows("A");
    const expected = [
      "article_new",
      ...Array.from({ length: 99 }, (_, i) => `article_${String(105 - i).padStart(3, "0")}`),
    ];
    expect(first.map((a) => a.id)).toEqual(expected);
    expect(again.map((a) => a.id)).toEqual(expected);
    expect(first).toHaveLength(100);
    expect(first.some((a) => a.id === "article_006" || a.id === "article_old")).toBe(false);
    expect(m.articlesFind).toHaveBeenCalledTimes(2);
  });
  it("articles preserve exact scoped owner/order/select/take and foreign author isolation", async () => {
    const a = await readTrainerOwnArticleMetadataRows("A");
    expect(a).toHaveLength(100);
    expect(m.articlesFind).toHaveBeenLastCalledWith({
      where: { authorId: "A" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        title: true,
        slug: true,
        visibility: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { articleLikes: true } },
      },
    });
    expect(Object.keys(a[0]!).sort()).toEqual([
      "_count",
      "createdAt",
      "id",
      "slug",
      "title",
      "updatedAt",
      "viewCount",
      "visibility",
    ]);
    const other = await readTrainerOwnArticleMetadataRows("B");
    expect(other.map((a) => a.id)).toEqual([
      "article_foreign_3",
      "article_foreign_2",
      "article_foreign_1",
      "article_foreign_0",
    ]);
    expect(await readTrainerOwnArticleMetadataRows("none")).toEqual([]);
  });
});
