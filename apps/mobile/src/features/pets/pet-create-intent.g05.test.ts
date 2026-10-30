import { describe, expect, it } from "vitest";
import { preparePetCreateIntent, startNewPetCreateIntent } from "./pet-create-intent";
const E1 = "51e35071-0752-4f22-b3aa-23f8844c8931";
const E2 = "d8f37921-b880-4b04-ae14-96c2e749b029";
const UUIDS = ["8ae52e9a-580f-4ab8-9545-397973bc32f5", "5639c98f-7140-4846-87f7-283a40ae1906"];
const pet = {
  name: "Бим",
  type: "DOG" as const,
  breed: "Корги",
  birthDate: "2020-03-15",
  weightKg: 4.25,
};
describe("G05 source/mock only mobile key lifecycle", () => {
  it("preserves UUID and frozen normalized payload for manual retry/uncertain result", () => {
    const first = preparePetCreateIntent(
      null,
      { ownerId: "A", authEpoch: E1 },
      pet,
      () => UUIDS[0],
    );
    const retry = preparePetCreateIntent(
      first,
      { ownerId: "A", authEpoch: E1 },
      { ...pet, name: "edited" },
      () => {
        throw Error("must not rotate");
      },
    );
    expect(retry).toBe(first);
    expect(retry.payload).toEqual(pet);
    expect(Object.isFrozen(retry.payload)).toBe(true);
  });
  it("rotates for deliberate new create", () => {
    const a = preparePetCreateIntent(null, { ownerId: "A", authEpoch: E1 }, pet, () => UUIDS[0]);
    const next = startNewPetCreateIntent({ ownerId: "A", authEpoch: E1 }, pet, () => UUIDS[1]);
    expect(next.clientRequestId).not.toBe(a.clientRequestId);
  });
  it("isolates A->B and same-user new epoch, no cross-owner key reuse", () => {
    const a = preparePetCreateIntent(null, { ownerId: "A", authEpoch: E1 }, pet, () => UUIDS[0]);
    const b = preparePetCreateIntent(a, { ownerId: "B", authEpoch: E1 }, pet, () => UUIDS[1]);
    expect(b.clientRequestId).not.toBe(a.clientRequestId);
    const a2 = preparePetCreateIntent(a, { ownerId: "A", authEpoch: E2 }, pet, () => UUIDS[1]);
    expect(a2.clientRequestId).not.toBe(a.clientRequestId);
  });
  it("fails closed for unverified actor or malformed key", () => {
    expect(() =>
      preparePetCreateIntent(null, { ownerId: "", authEpoch: E1 }, pet, () => UUIDS[0]),
    ).toThrow("G05_OWNER_EPOCH_UNVERIFIED");
    expect(() =>
      preparePetCreateIntent(null, { ownerId: "A", authEpoch: E1 }, pet, () => "not-uuid"),
    ).toThrow("G05_INVALID_UUID_V4");
  });
});
