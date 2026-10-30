import { describe, expect, it } from "vitest";
import { isValidOwnedPetWeightId, parseOwnedPetWeightHistoryData } from "@gafus/types";

const weight = {
  currentWeightKg: null, targetWeightKg: 18.7,
  entries: [{
    id: "measure_01", petId: "pet_A", ownerId: "PRIVATE_OWNER_ID",
    weightKg: 20.1, measuredAt: "2026-10-20T10:00:00.000Z",
    createdAt: "2026-10-21T10:00:00.000Z",
  }],
};

describe("GET /pets/:petId/weight shared read contract", () => {
  it.each(["pet_A", "pet-1", "a".repeat(128)])("accepts safe path ID %j", id =>
    expect(isValidOwnedPetWeightId(id)).toBe(true));
  it.each(["", ".", "..", "../other", "a/b", "a".repeat(129), "имя", null])(
    "rejects invalid ID %j", id => expect(isValidOwnedPetWeightId(id)).toBe(false));
  it("preserves nullable weights and dates, strips metadata and future fields", () => {
    expect(parseOwnedPetWeightHistoryData({
      ...weight, newField: "forward", entries: [{
        ...weight.entries[0], future: 1,
      }],
    }, "pet_A")).toEqual({
      currentWeightKg: null, targetWeightKg: 18.7,
      entries: [{
        id: "measure_01", weightKg: 20.1,
        measuredAt: "2026-10-20T10:00:00.000Z",
        createdAt: "2026-10-21T10:00:00.000Z",
      }],
    });
    expect(JSON.stringify(parseOwnedPetWeightHistoryData(weight, "pet_A")))
      .not.toContain("PRIVATE_OWNER_ID");
  });
  it.each([
    ["wrong owner path", {...weight, entries:[{...weight.entries[0], petId:"pet_B"}]}],
    ["missing entry petId", {...weight, entries:[{...weight.entries[0], petId:undefined}]}],
    ["string weight", {...weight, currentWeightKg:"20"}],
    ["nonfinite weight", {...weight, targetWeightKg:Infinity}],
    ["forged id", {...weight, entries:[{...weight.entries[0], id:"../other"}]}],
    ["noncanonical date", {...weight, entries:[{...weight.entries[0], measuredAt:"2026-10-20"}]}],
    ["missing createdAt", {...weight, entries:[{...weight.entries[0], createdAt:undefined}]}],
    ["missing entries", {...weight, entries:undefined}],
    ["array masquerading as object", [weight]],
    ["null payload", null],
  ])("fails closed for %s", (_kind, data) =>
    expect(parseOwnedPetWeightHistoryData(data,"pet_A")).toBeNull());
});
