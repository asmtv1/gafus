import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ db: null as unknown as import("@gafus/prisma").PrismaClient }));
vi.mock("@gafus/prisma", () => ({
  prisma: new Proxy({}, { get: (_target, key) => {
    const value = fixture.db[key];
    return typeof value === "function" ? value.bind(fixture.db) : value;
  } }),
}));
vi.mock("@gafus/cdn-upload", () => ({
  deleteFileFromCDN: vi.fn(), getPetDocumentPath: vi.fn(), getPetPhotoPath: vi.fn(),
  getRelativePathFromCDNUrl: vi.fn(), uploadFileToCDN: vi.fn(), getUserAvatarPath: vi.fn(),
}));
vi.mock("./petVetVisitService", () => ({ enqueuePetVetCleanup: vi.fn(), lockVetPet: vi.fn() }));
vi.mock("../cynologistChat/authorRole", () => ({ getChatDisplayRole: vi.fn().mockResolvedValue(null) }));

import { createPet, getUserPets, updatePet } from "./petsService";
import { getPublicProfile } from "../user/profileService";

const url = process.env.PET_PROFILE_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.pathname !== "/gafus_pet_visibility_test") {
    throw new Error("Dedicated local pet visibility test database required");
  }
  const require = createRequire(new URL("../../../../prisma/package.json", import.meta.url));
  fixture.db = new (require("@prisma/client").PrismaClient)({ datasources: { db: { url } } });
}

(url ? describe : describe.skip)("pet profile visibility / PostgreSQL", () => {
  let owner: string, other: string, username: string, petId: string;
  beforeEach(async () => {
    owner = randomUUID(); other = randomUUID(); username = `pet-profile-${owner}`;
    await fixture.db.user.createMany({ data: [
      { id: owner, username, password: "fixture" },
      { id: other, username: `pet-profile-${other}`, password: "fixture" },
    ] });
    const pet = await createPet(owner, {
      name: "Лада", type: "DOG", breed: "Метис", birthDate: "2020-01-15",
      heightCm: 40, notes: "Личные заметки",
    });
    petId = pet.id;
  });
  afterEach(async () => {
    await fixture.db.user.deleteMany({ where: { id: { in: [owner, other] } } });
  });
  afterAll(async () => { await fixture.db.$disconnect(); });

  it("shows new pets by default and exposes only the agreed public fields", async () => {
    expect((await getUserPets(owner))[0].showInProfile).toBe(true);
    const publicData = await getPublicProfile(username);
    expect(publicData?.pets).toEqual([{
      id: petId, name: "Лада", type: "DOG", breed: "Метис",
      birthDate: new Date("2020-01-15"), photoUrl: null,
    }]);
  });

  it("hides only the selected pet publicly and retains all owner data", async () => {
    const second = await createPet(owner, { name: "Мурка", type: "CAT", breed: "Метис", birthDate: "2022-01-01" });
    await updatePet(petId, owner, { showInProfile: false });
    expect((await getPublicProfile(username))?.pets.map((pet) => pet.id)).toEqual([second.id]);
    expect((await getPublicProfile(owner))?.pets.map((pet) => pet.id)).toEqual([second.id]);
    expect(await getUserPets(owner)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: petId, showInProfile: false, notes: "Личные заметки", heightCm: 40 }),
    ]));
    await updatePet(petId, owner, { name: "Ладушка" });
    expect((await getUserPets(owner)).find((pet) => pet.id === petId)?.showInProfile).toBe(false);
    await updatePet(petId, owner, { showInProfile: true });
    expect((await getPublicProfile(username))?.pets).toHaveLength(2);
  });

  it("returns an empty public list when all pets are hidden", async () => {
    await updatePet(petId, owner, { showInProfile: false });
    expect((await getPublicProfile(username))?.pets).toEqual([]);
    expect(await getUserPets(owner)).toHaveLength(1);
  });

  it("does not allow another account to change visibility", async () => {
    expect(await updatePet(petId, other, { showInProfile: false })).toBeNull();
    expect((await getPublicProfile(username))?.pets).toHaveLength(1);
  });
});
