import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  describePetMediaLocator,
  describeLegacyPetMediaDeletionPlan,
  petMediaDedupeKey,
  runClaimedPetMediaDeletion,
  type PetMediaIntent,
  type PetMediaDeletionPort,
} from "./petMediaDeletionOutbox";

const owner = "owner_A";
const pet = "pet_A";
const valid = "cloudru:documents:documents/uploads/users/owner_A/pets/pet_A/documents/report.pdf";

describe("pure Pet media owner/lease policy shared with the SQL adapter", () => {
  it("accepts only the exact owner and provider-scoped storage locator", () => {
    expect(describePetMediaLocator(owner, pet, valid).provider).toBe("cloudru-documents");
    expect(() => describePetMediaLocator("other", pet, valid)).toThrow();
    expect(() => describePetMediaLocator(owner, "other", valid)).toThrow();
    expect(() => describePetMediaLocator(owner, pet, valid + "?signature=secret")).toThrow();
    expect(petMediaDedupeKey(owner, valid)).toBe(petMediaDedupeKey(owner, valid));
    expect(petMediaDedupeKey("other", valid)).not.toBe(petMediaDedupeKey(owner, valid));
  });

  it("never activates legacy provider deletion from a qualified Yandex locator", () => {
    const legacy =
      "https://storage.yandexcloud.net/gafus-media/uploads/users/owner_A/pets/pet_A/photo.webp";
    expect(describeLegacyPetMediaDeletionPlan(owner, pet, legacy).activation).toBe(
      "DENIED_PENDING_VERSIONED_HEAD_REVIEW",
    );
  });

  it("never calls a provider for a stale lease even if the object is valid", async () => {
    const job: PetMediaIntent = {
      id: "job-A",
      ownerId: owner,
      petId: pet,
      locator: valid,
      provider: "cloudru-documents",
      dedupeKey: petMediaDedupeKey(owner, valid),
      reason: "document-delete",
      status: "processing",
      attemptToken: "attempt-A",
      leaseUntil: new Date(Date.now() + 30_000),
      attempts: 0,
    };
    const port: PetMediaDeletionPort = {
      withOwnerFence: vi.fn(),
      isLeaseCurrent: vi.fn(async () => false),
      hasActiveReference: vi.fn(),
      deleteAndVerify: vi.fn(),
      complete: vi.fn(),
      release: vi.fn(),
    };
    expect(await runClaimedPetMediaDeletion(job, port)).toBe("stale");
    expect(port.deleteAndVerify).not.toHaveBeenCalled();
    expect(port.withOwnerFence).not.toHaveBeenCalled();
  });

  it("the compiled shared policy cannot import database or provider implementations", () => {
    const source = readFileSync(join(import.meta.dirname, "petMediaDeletionOutbox.ts"), "utf8");
    const file = ts.createSourceFile(
      "petMediaDeletionOutbox.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    const violations: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        /@gafus\/(?:prisma|.*-server)|^(?:pg|ioredis|bullmq|@aws-sdk)/.test(
          node.moduleSpecifier.text,
        )
      )
        violations.push("server/ORM/provider dependency");
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "fetch"
      )
        violations.push("network call");
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(file, visit);
    expect(violations).toEqual([]);
  });
});
