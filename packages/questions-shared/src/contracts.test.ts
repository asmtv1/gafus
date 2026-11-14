import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { z } from "zod/v3";
import {
  questionCreateSchema,
  answerCreateSchema,
  questionEditSchema,
  questionListSchema,
} from "./schemas";
import { QuestionError, questionHttpError } from "./errors";

describe("independent Question contracts shared by Core and SQL writer", () => {
  it("cannot import server persistence, ORM or a network/provider client", () => {
    for (const name of ["errors", "schemas"]) {
      const code = readFileSync(join(import.meta.dirname, name + ".ts"), "utf8");
      const source = ts.createSourceFile(name + ".ts", code, ts.ScriptTarget.Latest, true);
      const errors: string[] = [];
      const check = (node: ts.Node): void => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          /@gafus\/(?:prisma|.*-server)|^(?:pg|ioredis|bullmq)$/.test(node.moduleSpecifier.text)
        )
          errors.push("server database/queue import");
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "fetch"
        )
          errors.push("network access");
        ts.forEachChild(node, check);
      };
      ts.forEachChild(source, check);
      expect(errors, name).toEqual([]);
    }
  });

  it("preserves exact public error class and redacted unknown failure status", () => {
    expect(questionHttpError(new QuestionError("PHOTO_FORBIDDEN", "Недоступно", 403))).toEqual({
      status: 403,
      body: { success: false, error: "Недоступно", code: "PHOTO_FORBIDDEN" },
    });
    const unknown = questionHttpError({
      toString: () => "SYNTHETIC_PRIVATE_PROVIDER_SECRET",
    });
    expect(unknown).toMatchObject({
      status: 500,
      body: { success: false, code: "QUESTIONS_UNAVAILABLE" },
    });
    expect(JSON.stringify(unknown)).not.toContain("SYNTHETIC_PRIVATE_PROVIDER_SECRET");
  });
  it("requires UUID idempotency keys on question and answer writes", () => {
    const req = { title: "Тема", body: "Текст", category: "other", tags: [], photoIds: [] };
    expect(questionCreateSchema.safeParse(req).success).toBe(false);
    expect(answerCreateSchema.safeParse({ body: "Ответ", photoIds: [] }).success).toBe(false);
  });
  it("rejects duplicate photos and excessive attachments before SQL writes", () => {
    const req = { title: "Тема", body: "Текст", photoIds: ["photo-a", "photo-a"] };
    expect(questionEditSchema.safeParse(req).success).toBe(false);
    expect(
      questionEditSchema.safeParse({
        ...req,
        photoIds: Array.from({ length: 6 }, (_, i) => "id-" + i),
      }).success,
    ).toBe(false);
  });
  it("rejects unbounded pagination and sanitizes search input", () => {
    expect(questionListSchema.safeParse({ page: 10001 }).success).toBe(false);
    expect(questionListSchema.safeParse({ search: "a".repeat(151) }).success).toBe(false);
  });
});
