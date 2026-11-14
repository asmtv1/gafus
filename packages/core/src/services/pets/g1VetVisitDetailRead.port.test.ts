import { describe, expect, it, vi } from "vitest";
import { getOwnVetVisitDetail, VetVisitDetailNotFoundError } from "./g1VetVisitDetailRead.review";

describe("private vet visit Core validation with an explicit owner-scoped read port", () => {
  it("passes exactly the authenticated owner and resource IDs", async () => {
    const read = vi.fn(async () => ({ id: "visit", petId: "pet" }));
    const result = await getOwnVetVisitDetail("owner-A", "pet", "visit", read as never);
    expect(result).toMatchObject({ id: "visit", petId: "pet" });
    expect(read).toHaveBeenCalledExactlyOnceWith("owner-A", "pet", "visit");
  });
  it("rejects malformed pet/visit IDs before SQL and uses a stable error class", async () => {
    const read = vi.fn();
    await expect(getOwnVetVisitDetail("owner-A", "../other", "visit", read)).rejects.toBeInstanceOf(
      VetVisitDetailNotFoundError,
    );
    await expect(getOwnVetVisitDetail("owner-A", "pet", "bad%2Fvisit", read)).rejects.toMatchObject(
      { status: 404, code: "VET_VISIT_NOT_FOUND" },
    );
    expect(read).not.toHaveBeenCalled();
  });
});
