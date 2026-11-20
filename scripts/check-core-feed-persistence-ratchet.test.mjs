import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  check,
  hasFeedOrmDependency,
  scanFeedPersistence,
} from "./check-core-feed-persistence-ratchet.mjs";

test("detects persistence through renamed receivers and bracket access", () => {
  const source = [
    "type Database = FeedDb;",
    "type Transaction = FeedTx;",
    "repository.feedPost.findUniqueOrThrow({});",
    "scope['feedPoll']['findMany']({});",
    "scope.$queryRawUnsafe(sql);",
  ].join("\n");
  assert.deepEqual(scanFeedPersistence(source), { FeedDb: 1, FeedTx: 1, delegates: 2, rawSQL: 1 });
});

test("rejects the ORM import, its shared types, and indirect server imports", () => {
  for (const module of [
    "@gafus/prisma",
    "@gafus/media-shared/media-db-ports",
    "@gafus/feed-server/account-cleanup",
  ]) {
    assert.equal(hasFeedOrmDependency(`import type { X as Row } from "${module}";`), true);
  }
  assert.equal(hasFeedOrmDependency("await repository.$transaction(run);"), true);
  assert.equal(hasFeedOrmDependency("await operations.readPendingRevision(id);"), false);
});


test("strict gate rejects new production files in nested directories", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "gafus-feed-boundary-"));
  try {
    mkdirSync(join(temporaryRoot, "new", "nested"), { recursive: true });
    writeFileSync(
      join(temporaryRoot, "new", "nested", "unregistered-persistence.ts"),
      'import { prisma } from "@gafus/prisma";\nexport const unsafe = prisma.feedPost.findMany({});\n',
    );
    assert.throws(
      () => check(true, temporaryRoot, { files: {} }),
      (error) => {
        assert.match(error.message, /new\/nested\/unregistered-persistence\.ts: ORM dependency/);
        assert.match(error.message, /"delegates":1/);
        return true;
      },
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("strict gate rejects a newly added nested raw SQL module", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "gafus-feed-sql-boundary-"));
  try {
    mkdirSync(join(temporaryRoot, "nested"), { recursive: true });
    writeFileSync(join(temporaryRoot, "nested", "sql.ts"), 'async function unsafe(db) { return db.$executeRawUnsafe("DELETE FROM FeedPost"); }\n');
    assert.throws(
      () => check(true, temporaryRoot, { files: {} }),
      (error) => {
        assert.match(error.message, /nested\/sql\.ts rawSQL: 1 > 0/);
        return true;
      },
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
