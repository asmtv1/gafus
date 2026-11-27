import { describe, expect, it } from "vitest";
import { validatedPetsForActor } from "./petsReadValidation";
const actor = { ownerId: "owner" };
const pet = { id: "pet", ownerId: "owner", name: "Dog", type: "DOG", showInProfile: true,
  createdAt: "2026-01-01T00:00:00Z", breed: null, birthDate: null, photoUrl: null,
  notes: null, heightCm: null, weightKg: null, neckGirthCm: null, muzzleGirthCm: null, bellyGirthCm: null };
describe("pet list summary counts", () => {
  it("retains server counts without loading document or prevention histories", () => {
    const item = {...pet, _count: {preventionEntries: 0, documents: 5}};
    expect(validatedPetsForActor([item], actor)).toEqual([item]);
  });
  it("accepts legacy list without summary counts", () => {
    expect(validatedPetsForActor([pet], actor)).toEqual([pet]);
  });
  it.each([null, {documents: 0}, {documents: -1, preventionEntries: 1}, {documents: 1.5, preventionEntries: 1}, {documents: "1", preventionEntries: 1}])("rejects malformed summary %j", (_count) => {
    expect(() => validatedPetsForActor([{...pet, _count}], actor)).toThrow("PETS_LIST_INVALID");
  });
});
