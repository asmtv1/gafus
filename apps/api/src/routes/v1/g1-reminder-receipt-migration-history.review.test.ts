/** AG1 source-only receipt migration audit; never executes SQL. */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
const root = new URL("../../../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const ddl = read("apps/api/src/test/fixtures/reminder-review/AG1_REMINDER_RECEIPT_PRISMA_ADDITIVE_MIGRATION.AG4_REVIEW_ONLY_20261018.sql");
const schema = read("packages/prisma/schema.prisma");
const folders = readdirSync(new URL("packages/prisma/migrations/", root), { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name);
const modelStart = schema.indexOf("model ReminderMutationReceipt {");
const model = schema.slice(modelStart, schema.indexOf("\n}\n", modelStart) + 2);
describe("Reminder receipt additive migration compatibility (review only)", () => {
  it("M01 Prisma schema owner/key PK, index, cascade relation", () => {
    expect(modelStart).toBeGreaterThan(0);
    expect(model).toContain("@@id([ownerUserId, operationKey])");
    expect(model).toContain("@@index([ownerUserId, expiresAt])");
    expect(model).toContain("onDelete: Cascade");
    expect(schema).toContain("reminderMutationReceipts         ReminderMutationReceipt[]");
  });
  it("M02 candidate DDL all 9 columns and expected defaults", () => {
    for (const key of ["ownerUserId", "operationKey", "operationKind", "fingerprint", "state",
      "reminderId", "responseJson", "expiresAt", "createdAt"]) {
      expect(model).toContain(key); expect(ddl).toContain(`"${key}"`);
    }
    expect(ddl).toContain('"operationKey" VARCHAR(36) NOT NULL');
    expect(ddl).toContain("DEFAULT 'CREATE'"); expect(ddl).toContain("DEFAULT 'PENDING'");
    expect(ddl).toContain('"responseJson" JSONB');
    expect(ddl).toContain('"expiresAt" TIMESTAMP(3) NOT NULL');
  });
  it("M03 new composite key, secondary index, owner FK; no FK to Reminder", () => {
    expect(ddl).toContain('CONSTRAINT "ReminderMutationReceipt_pkey" PRIMARY KEY');
    expect(ddl).toContain('"ReminderMutationReceipt_ownerUserId_expiresAt_idx"');
    expect(ddl).toContain('"ReminderMutationReceipt_ownerUserId_fkey"');
    expect(ddl).toContain("ON DELETE CASCADE ON UPDATE CASCADE");
    expect(ddl).not.toMatch(/FOREIGN KEY\s*\(\s*"reminderId"/i);
  });
  it("M04 additive only; no data mutation or idempotent drift-masking", () => {
    const sql = ddl.split("\n").map((s) => s.replace(/--.*$/, "")).join("\n");
    expect(sql).toContain('CREATE TABLE "ReminderMutationReceipt"');
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE)\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bUPDATE\s+"|\bINSERT\s+INTO\b|\bRENAME\s+TO\b/i);
    expect(sql).not.toMatch(/ALTER TABLE "(?!ReminderMutationReceipt)/);
    expect(sql).not.toContain("IF NOT EXISTS");
  });
  it("M05 exactly one versioned migration equals reviewed receipt DDL, no duplicate ledger DDL", () => {
    expect(folders).toContain("20261017190000_g05_pet_create_receipt");
    const migrationName = "20261018110000_reminder_mutation_receipt";
    expect(folders).toContain(migrationName);
    const ddlOwners = folders.filter((folder) =>
      read(`packages/prisma/migrations/${folder}/migration.sql`)
        .includes('CREATE TABLE "ReminderMutationReceipt"'));
    expect(ddlOwners).toEqual([migrationName]);
    expect(read(`packages/prisma/migrations/${migrationName}/migration.sql`)).toBe(ddl);
    expect(read("packages/prisma/migrations/migration_lock.toml"))
      .toContain('provider = "postgresql"');
    expect(folders.length).toBeGreaterThanOrEqual(140);
  });
  it("M06 Core raw SQL matches schema and locks same owner", () => {
    const core = read("packages/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.ts");
    expect(core).toContain('INSERT INTO "ReminderMutationReceipt"');
    expect(core).toContain('UPDATE "ReminderMutationReceipt" SET "state"');
    expect(core).toContain('AND "registrationPending" = false FOR UPDATE');
    expect(core).toContain('"ownerUserId" = ${owner}');
    expect(core).toContain('"operationKey" = ${key}');
    expect(ddl).toContain('"ownerUserId" TEXT NOT NULL');
  });
});
