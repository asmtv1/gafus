/** AG1 USER020/PETS real work PG18 READ, no Hono auth or HTTP implication. */
import { afterAll, describe, it, vi } from "vitest";

// Side-effect modules must NOT be evaluated or invoked; true target
// application functions, Core read services and Prisma remain unmocked.
const blocked = vi.hoisted(() =>
  vi.fn((): never => {
    throw Error("NON_READ_BOUNDARY_DENIED");
  }),
);
vi.mock("@gafus/cdn-upload", () => ({
  uploadFileToCDN: blocked,
  deleteFileFromCDN: blocked,
  getRelativePathFromCDNUrl: blocked,
  getUserAvatarPath: blocked,
  getPetDocumentPath: blocked,
  getPetPhotoPath: blocked,
  parsePrivateMediaLocation: blocked,
  signPrivateUserMedia: blocked,
  privateMediaEnabled: blocked,
  privateMediaLocation: blocked,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: blocked, warn: blocked, error: blocked }),
}));
vi.mock("../../../../../../packages/core/src/services/pets/petVetVisitService", () => ({
  enqueuePetVetCleanup: blocked,
  lockVetPet: blocked,
}));
vi.mock("../../../../../../packages/core/src/services/cynologistChat/authorRole", () => ({
  getChatDisplayRole: blocked,
}));

import { prisma } from "@gafus/prisma";
import { createReadProfileApplication } from "../../user/application/read-profile";
import { getPetWeightHistory } from "../../../../../../packages/core/src/services/pets/petWeightService";
import { readPetsApplication as petApp } from "./read-pets";
import { getUserProfileForApi } from "../../../../../../packages/core/src/services/user/profileService";

// These are original application factories bound to actual current Core,
// not HTTP actor injection, fake Prisma, or duplicated read implementations.
const profileApp = createReadProfileApplication({ loadProfile: getUserProfileForApi });

const noData = (condition: boolean, code: string) => {
  if (!condition) throw Error(code); // Never stringify real rows/IDs in errors.
};
const isIso = (value: unknown) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const isValidDate = (value: unknown) => value instanceof Date && Number.isFinite(value.getTime());

// No touching reference DB, no test fixture insertion or cleanup mutation.
afterAll(async () => {
  await prisma.$disconnect();
});

describe("AG1 USER020/PETS original application+Core→real work PG18 read-only", () => {
  it("verifies the actual Prisma connection is fail-closed read-only work role", async () => {
    const state = await prisma.$queryRaw<
      {
        database: string;
        role: string;
        readonly: string;
        timeout: string;
      }[]
    >`SELECT current_database() AS database, current_user AS role,
      current_setting('default_transaction_read_only') AS readonly,
      current_setting('statement_timeout') AS timeout`;
    noData(
      state.length === 1 && state[0].database === "gafus_refactor_real_work_20261024",
      "UNEXPECTED_DATABASE",
    );
    noData(state[0].role === "gafus_refactor_local_real", "UNEXPECTED_DATABASE_ROLE");
    noData(state[0].readonly === "on", "READ_ONLY_SESSION_REQUIRED");
    noData(state[0].timeout !== "0", "STATEMENT_TIMEOUT_REQUIRED");
    process.stdout.write("AG1_SQL_READ_ONLY_WORK_ROLE_PASS\n");
  });

  it("reads a real existing actor privately through the original profile application", async () => {
    const actor = await prisma.user.findUnique({
      where: { username: "admin" },
      select: { id: true },
    });
    noData(!!actor?.id, "ACTOR_NOT_PRESENT");
    const outcome = await profileApp.execute({ actorUserId: actor!.id });
    noData(outcome.kind === "found", "PROFILE_NOT_FOUND");
    if (outcome.kind !== "found") return;
    const value = outcome.profile;
    noData(value.id === actor!.id && value.role === "ADMIN", "PROFILE_ACTOR_MISMATCH");
    noData(value.profile !== null && typeof value.profile === "object", "PROFILE_WIRE_MISMATCH");
    noData(
      value.profile.birthDate === null || /^\d{4}-\d{2}-\d{2}$/.test(value.profile.birthDate),
      "PROFILE_BIRTHDATE_WIRE",
    );
    noData(
      value.onboardingTourCompletedAt === null || isIso(value.onboardingTourCompletedAt),
      "PROFILE_ONBOARDING_ISO",
    );
    const json = JSON.parse(JSON.stringify(value)) as {
      id: string;
      profile: { birthDate: string | null };
    };
    noData(
      json.id === actor!.id && json.profile.birthDate === value.profile.birthDate,
      "PROFILE_JSON_WIRE",
    );
    process.stdout.write("AG1_REAL_PROFILE_APPLICATION_PASS shape=id,role,profile,ISO_nullable\n");
  });

  it("reads 2 owned pets, original details and 3 weight rows, rejects nonowner reads", async () => {
    const actor = await prisma.user.findUnique({
      where: { username: "admin" },
      select: { id: true },
    });
    noData(!!actor?.id, "ACTOR_NOT_PRESENT");
    const pets = await petApp.list({ actorUserId: actor!.id });
    noData(pets.length === 2, "OWNED_PET_COUNT_MISMATCH");
    let weights = 0;
    for (const pet of pets) {
      noData(pet.ownerId === actor!.id && isValidDate(pet.birthDate), "PET_OWNER_DATE_MISMATCH");
      const detail = await petApp.detail({ petId: pet.id, actorUserId: actor!.id });
      noData(detail !== null && detail.ownerId === actor!.id, "PET_DETAIL_OWNER_MISMATCH");
      noData(
        detail !== null && detail.id === pet.id && isValidDate(detail.birthDate),
        "PET_DETAIL_DATE_MISMATCH",
      );
      const wire = JSON.parse(JSON.stringify(detail)) as { birthDate?: unknown };
      noData(isIso(wire.birthDate), "PET_DETAIL_ISO_WIRE_MISMATCH");
      const history = await getPetWeightHistory(pet.id, actor!.id);
      noData(history !== null && Array.isArray(history.entries), "OWN_WEIGHT_NOT_FOUND");
      noData(
        history !== null &&
          (history.currentWeightKg === null || Number.isFinite(history.currentWeightKg)),
        "CURRENT_WEIGHT_NOT_FINITE",
      );
      noData(
        history !== null &&
          (history.targetWeightKg === null || Number.isFinite(history.targetWeightKg)),
        "TARGET_WEIGHT_NOT_FINITE",
      );
      if (!history) return;
      weights += history.entries.length;
      for (let i = 0; i < history.entries.length; i++) {
        const entry = history.entries[i];
        noData(entry.petId === pet.id && entry.ownerId === actor!.id, "WEIGHT_OWNER_MISMATCH");
        noData(
          Number.isFinite(entry.weightKg) && isValidDate(entry.measuredAt),
          "WEIGHT_INVALID_VALUES",
        );
        if (i > 0)
          noData(
            history.entries[i - 1].measuredAt.getTime() <= entry.measuredAt.getTime(),
            "WEIGHT_SORT_ORDER",
          );
      }
      const json = JSON.parse(JSON.stringify(history)) as {
        entries: { measuredAt: unknown; createdAt: unknown }[];
      };
      noData(
        json.entries.every((entry) => isIso(entry.measuredAt) && isIso(entry.createdAt)),
        "WEIGHT_JSON_ISO_WIRE",
      );
    }
    noData(weights === 3, "OWN_WEIGHT_COUNT_MISMATCH");
    const foreign = await prisma.pet.findFirst({
      where: { ownerId: { not: actor!.id } },
      select: { id: true },
    });
    noData(!!foreign?.id, "FOREIGN_PET_NOT_PRESENT");
    const foreignDetail = await petApp.detail({ petId: foreign!.id, actorUserId: actor!.id });
    const foreignWeight = await getPetWeightHistory(foreign!.id, actor!.id);
    noData(foreignDetail === null && foreignWeight === null, "FOREIGN_PET_LEAK");
    noData(blocked.mock.calls.length === 0, "UNUSED_SIDE_EFFECT_BOUNDARY_CALLED");
    process.stdout.write(
      "AG1_REAL_PETS_OWNER_READ_PASS owned_pets=2 weight_entries=3 foreign_detail=masked foreign_weight=masked\n",
    );
  });
});
