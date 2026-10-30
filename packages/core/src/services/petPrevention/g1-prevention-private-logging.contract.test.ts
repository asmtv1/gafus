/** Core prevention service: no raw exception, Zod issue, or owner/pet ID in logging. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const m = vi.hoisted(() => ({ petLookup: vi.fn(), logError: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: { pet: { findFirst: m.petLookup } },
  Prisma: {
    DbNull: {},
    PrismaClientKnownRequestError: class extends Error {},
    PrismaClientValidationError: class extends Error {},
  },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: m.logError }),
}));

import { ServiceError } from "../../errors/ServiceError";
import { getEntriesByPet } from "./petPreventionService";

const CANARY = "SYNTHETIC_PRIVATE_MEDICAL_ISSUE_DO_NOT_LOG";
const OWNER = "SYNTHETIC_OWNER_IDENTIFIER_PRIVATE";
const PET = "SYNTHETIC_PET_IDENTIFIER_PRIVATE";

function assertNoPrivateLogs() {
  expect(m.logError).toHaveBeenCalledTimes(1);
  const args = m.logError.mock.calls.flat();
  const serialized = args.map(x => x instanceof Error
    ? [x.message, x.stack, String(x.cause)].join(" ")
    : JSON.stringify(x)).join(" ");
  expect(serialized).not.toContain(CANARY);
  expect(serialized).not.toContain(OWNER);
  expect(serialized).not.toContain(PET);
}
beforeEach(() => vi.resetAllMocks());

describe("AG1 Core prevention service: sensitive medical failure logging (no SQL)", () => {
  it("ServiceError context and message cannot enter logs; unchanged generic response", async () => {
    m.petLookup.mockRejectedValueOnce(new ServiceError(CANARY, `SYNTHETIC_${CANARY}`));
    const result = await getEntriesByPet(OWNER, PET);
    expect(result).toEqual({ success: false, error: "Не удалось загрузить записи" });
    assertNoPrivateLogs();
  });

  it("Zod issues cannot enter logs; still reports invalid data", async () => {
    m.petLookup.mockRejectedValueOnce(new ZodError([
      { code: "custom", path: ["notes"], message: CANARY },
    ]));
    const result = await getEntriesByPet(OWNER, PET);
    expect(result).toEqual({ success: false, error: "Неверные данные" });
    assertNoPrivateLogs();
  });

  it("unknown exception does not expose request identifiers to logs", async () => {
    m.petLookup.mockRejectedValueOnce(new Error(CANARY));
    const result = await getEntriesByPet(OWNER, PET);
    expect(result).toEqual({ success: false, error: "Не удалось загрузить записи" });
    assertNoPrivateLogs();
  });
});
