import { describe, expect, it, vi } from "vitest";
import { getUserPets, getPetById } from "./petsReadService";

describe("Core pet reads use only authenticated-owner projections", () => {
  it("forwards the server-authenticated owner to the list port", async () => {
    const read = vi.fn(async (_ownerId: string) => [{ id: "pet-owned" }]);
    expect(await getUserPets("owner-A", { throwOnError: true }, read)).toEqual([
      { id: "pet-owned" },
    ]);
    expect(read).toHaveBeenCalledExactlyOnceWith("owner-A");
  });
  it("never falls back to an empty list on strict API/database failure", async () => {
    const read = vi.fn(async () => {
      throw new Error("DATABASE_UNAVAILABLE");
    });
    await expect(getUserPets("owner-A", { throwOnError: true }, read)).rejects.toThrow(
      "DATABASE_UNAVAILABLE",
    );
    expect(await getUserPets("owner-A", {}, read)).toEqual([]);
  });
  it("uses both owner and pet keys for detail and preserves not-found as null", async () => {
    const read = vi.fn(async (_petId: string, _ownerId: string) => null);
    expect(await getPetById("pet-A", "owner-A", read)).toBeNull();
    expect(read).toHaveBeenCalledExactlyOnceWith("pet-A", "owner-A");
  });
  it("does not turn a failed owner-scoped detail projection into a public response", async () => {
    const read = vi.fn(async () => {
      throw Error("PRIVATE_DB_FAULT");
    });
    await expect(getPetById("pet-A", "owner-A", read)).rejects.toThrow("PRIVATE_DB_FAULT");
  });
});
