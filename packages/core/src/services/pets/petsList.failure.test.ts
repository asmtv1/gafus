import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@gafus/prisma", () => ({
  prisma: { pet: { findMany } },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));
vi.mock("@gafus/cdn-upload", () => ({}));
vi.mock("./petVetVisitService", () => ({
  enqueuePetVetCleanup: vi.fn(),
  lockVetPet: vi.fn(),
}));

import { getUserPets } from "./petsService";

describe("owner pets read-only failure semantics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the owner's pet rows", async () => {
    findMany.mockResolvedValue([{ id: "pet1", name: "Рекс" }]);
    expect(await getUserPets("owner-1", { throwOnError: true })).toEqual([
      { id: "pet1", name: "Рекс" },
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId: "owner-1" },
      include: expect.objectContaining({
        _count: { select: { preventionEntries: true, documents: true } },
      }),
    }));
  });

  it("Hono strict mode does not silently turn a backend failure into []", async () => {
    findMany.mockRejectedValue(new Error("isolated database outage"));
    await expect(getUserPets("owner-1", { throwOnError: true }))
      .rejects.toThrow("isolated database outage");
  });

  it("preserves the old non-strict fallback for legacy direct callers", async () => {
    findMany.mockRejectedValue(new Error("isolated database outage"));
    expect(await getUserPets("owner-1")).toEqual([]);
  });
});
