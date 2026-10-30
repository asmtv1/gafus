/**
 * G05 packaging gate: imports ACTUAL package export from existing shared Core
 * dist (NO source alias, NO dist generation). PASS here means the deployed
 * package CURRENT behavior is accurately identified. It does NOT prove SQL-backed replay.
 * The Prisma delegate is intercepted to avoid touching any database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  create: vi.fn(),
  transaction: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: { pet: { create: mock.create }, $transaction: mock.transaction },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: mock.error, info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));
// IMPORTANT: normal package resolution, no Vitest alias to Core .ts source.
import { createPet } from "@gafus/core/services/pets";

const owner = "synthetic-owner-G05";
const createInput = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  type: "DOG",
  breed: "Метис",
  birthDate: "2020-02-29",
  weightKg: 4.25,
  ...extra,
});
const packedCreate = Function.prototype.toString.call(createPet);

describe("G05 current shared packaged Core smoke (NO SQL)", () => {
  beforeEach(() => {
    mock.create.mockReset();
    mock.transaction.mockReset();
    mock.error.mockReset();
    let n = 0;
    mock.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      n += 1;
      return { id: `synthetic-pet-${n}`, ...data, awards: [] };
    });
  });
  it("P01 actual package export is importable from shared dist", () => {
    expect(typeof createPet).toBe("function");
  });
  it("P02 compiled createPet includes the versioned receipt/UUID transaction path", () => {
    expect(packedCreate).toContain("PetCreateReceipt");
    expect(packedCreate).toContain("clientRequestId");
    expect(packedCreate).toContain("$transaction");
  });
  it("P03 normal unkeyed packaged runtime still creates independently (legacy-compatible)", async () => {
    const a = await createPet(owner, createInput("A"));
    const b = await createPet(owner, createInput("A"));
    expect(a.id).not.toBe(b.id);
    expect(mock.create).toHaveBeenCalledTimes(2);
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("P04 packaged Core preserves supplied 4.25 initial pet weight", async () => {
    const result = await createPet(owner, createInput("Weight"));
    expect(result.weightKg).toBe(4.25);
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ weightKg: 4.25 }) }),
    );
  });
  it("P05 packaged legacy runtime wraps database errors without exposing raw details", async () => {
    mock.create.mockRejectedValueOnce(new Error("synthetic-sql-secret-not-for-client"));
    await expect(createPet(owner, createInput("DB failure"))).rejects.toThrow(
      "Не удалось создать питомца",
    );
    expect(mock.error).toHaveBeenCalledTimes(1);
  });
  it("P06 a keyed create fails closed without a transactional receipt store", async () => {
    const key = "c12a6c9c-1f72-4476-a342-bfdd9ba68c23";
    mock.transaction.mockRejectedValueOnce(new Error("synthetic-transaction-unavailable-secret"));
    await expect(createPet(owner, createInput("keyed", { clientRequestId: key }))).rejects.toThrow(
      "Не удалось создать питомца",
    );
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.error).toHaveBeenCalledTimes(1);
  });
});
