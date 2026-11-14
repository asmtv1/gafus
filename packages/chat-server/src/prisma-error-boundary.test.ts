import { describe, expect, it } from "vitest";
import { Prisma } from "@gafus/prisma";
import {
  ConflictError, InternalServiceError, ValidationError,
  prismaErrorToServiceError,
} from "@gafus/core/errors";

describe("Core Prisma error projection using a real generated client class", () => {
  it("preserves P2002 projection for the actual Prisma 6 error", () => {
    const failure = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002", clientVersion: "6.10.1", meta: { target: ["email"] },
    });
    const projected = prismaErrorToServiceError(failure);
    expect(projected).toBeInstanceOf(ConflictError);
    expect(projected?.message).toContain("email");
  });

  it("maps actual validation errors but never unrelated errors or forged POJOs", () => {
    const validation = new Prisma.PrismaClientValidationError("invalid input", {
      clientVersion: "6.10.1",
    });
    expect(prismaErrorToServiceError(validation)).toBeInstanceOf(ValidationError);
    expect(prismaErrorToServiceError(Object.assign(new Error("not from Prisma"), {
      code: "P2002",
    }))).toBeNull();
    expect(prismaErrorToServiceError({ name: "PrismaClientKnownRequestError", code: "P2002" }))
      .toBeNull();
  });

  it("does not leak an unrecognized Prisma code to the response", () => {
    const failure = new Prisma.PrismaClientKnownRequestError("database details", {
      code: "P9999", clientVersion: "6.10.1",
    });
    const projected = prismaErrorToServiceError(failure);
    expect(projected).toBeInstanceOf(InternalServiceError);
    expect(projected?.message).not.toContain("P9999");
  });
});
