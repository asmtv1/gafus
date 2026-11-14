import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  FEED_AUTHOR_SELECT,
  FEED_POST_INCLUDE,
  type FeedDb,
  type FeedTx,
  type GalleryDb,
  type GalleryTx,
  type FeedPostRow,
  type GalleryPhotoWhere,
} from "./mediaDbPorts";

describe("independent Feed/Gallery typed persistence contracts", () => {
  it("keeps the author projection and post relation layout unchanged", () => {
    expect(FEED_AUTHOR_SELECT).toEqual({
      id: true,
      username: true,
      role: true,
      profile: { select: { fullName: true, avatarUrl: true } },
    });
    expect(FEED_POST_INCLUDE).toEqual({
      author: { select: FEED_AUTHOR_SELECT },
    });
    expect(FEED_POST_INCLUDE.author.select).toBe(FEED_AUTHOR_SELECT);
  });
  it("keeps storage boundaries type-only and import-free at runtime", () => {
    const code = readFileSync(join(import.meta.dirname, "mediaDbPorts.ts"), "utf8");
    const parsed = ts.createSourceFile("mediaDbPorts.ts", code, ts.ScriptTarget.Latest, true);
    const imports = parsed.statements.filter(ts.isImportDeclaration);
    expect(imports).toHaveLength(1);
    expect(imports[0]?.importClause?.isTypeOnly).toBe(true);
    expect((imports[0]?.moduleSpecifier as ts.StringLiteral).text).toBe("@gafus/prisma");
    expect(code).not.toMatch(/\bfetch\s*\(|\bprisma\s*\.|\bnew\s+PrismaClient\s*\(/);
  });
  it("retains compile-time DB and DTO structural contracts without a runtime DB", () => {
    type DbTypes = [FeedDb, FeedTx, GalleryDb, GalleryTx, FeedPostRow, GalleryPhotoWhere];
    const assertTypeOnly: DbTypes | null = null;
    expect(assertTypeOnly).toBeNull();
  });
});
