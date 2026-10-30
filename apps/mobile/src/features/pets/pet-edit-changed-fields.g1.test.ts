import { describe, expect, it } from "vitest";
import type { Pet } from "@/shared/lib/api/pets";
import { getPetEditChanges, matchesPetEditReadback } from "./pet-edit-changed-fields";
const pet = (): Pet => ({
  id: "pet-A",
  name: "Бим",
  type: "DOG",
  breed: "Корги",
  birthDate: "2020-02-29T00:00:00.000Z",
  heightCm: 55,
  weightKg: null,
  targetWeightKg: null,
  neckGirthCm: null,
  muzzleGirthCm: null,
  bellyGirthCm: null,
  photoUrl: "private",
  showInProfile: true,
  notes: null,
  createdAt: "2020-03-01T00:00:00.000Z",
});
describe("pet partial diff plus server readback", () => {
  it("ISO date and nullable notes do not cause unchanged PUT", () =>
    expect(
      getPetEditChanges(pet(), {
        name: "Бим",
        type: "DOG",
        breed: "Корги",
        birthDate: "2020-02-29",
        heightCm: 55,
        notes: "",
      }),
    ).toEqual({ ok: true, changes: {} }));
  it("name only does not overpost other private attributes", () =>
    expect(
      getPetEditChanges(pet(), { name: "Бимка", birthDate: "2020-02-29", heightCm: 55, notes: "" }),
    ).toEqual({ ok: true, changes: { name: "Бимка" } }));
  it("AG4 nullable height clear emits explicit null and GET must return null", () => {
    expect(getPetEditChanges(pet(), { heightCm: undefined })).toEqual({
      ok: true,
      changes: { heightCm: null },
    });
    expect(matchesPetEditReadback("pet-A", { heightCm: null }, pet())).toBe(false);
    expect(matchesPetEditReadback("pet-A", { heightCm: null }, { ...pet(), heightCm: null })).toBe(
      true,
    );
  });
  it("all four prior numbers clear to null but omitted existing nulls remain omitted", () => {
    const original = { ...pet(), neckGirthCm: 31, muzzleGirthCm: 22, bellyGirthCm: 44 };
    expect(
      getPetEditChanges(original, {
        heightCm: undefined,
        neckGirthCm: undefined,
        muzzleGirthCm: undefined,
        bellyGirthCm: undefined,
      }),
    ).toEqual({
      ok: true,
      changes: { heightCm: null, neckGirthCm: null, muzzleGirthCm: null, bellyGirthCm: null },
    });
  });
  it("weightKg cannot be silently accepted by generic edit", () => {
    expect(getPetEditChanges(pet(), { weightKg: 9 } as never)).toEqual({
      ok: false,
      field: "weightKg",
    });
  });
  it("optional null measurements remain omitted", () =>
    expect(getPetEditChanges(pet(), { heightCm: 55, neckGirthCm: undefined })).toEqual({
      ok: true,
      changes: {},
    }));
  it("real ISO date GET matches calendar DOB update", () =>
    expect(
      matchesPetEditReadback(
        "pet-A",
        { birthDate: "2020-03-01" },
        { ...pet(), birthDate: "2020-03-01T00:00:00.000Z" },
      ),
    ).toBe(true));
  it("wrong id and stale changed fields fail closed", () => {
    expect(matchesPetEditReadback("pet-A", { name: "Бимка" }, pet())).toBe(false);
    expect(matchesPetEditReadback("pet-A", { name: "Бим" }, { ...pet(), id: "pet-B" })).toBe(false);
  });
});
