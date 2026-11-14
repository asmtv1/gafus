/** Strictly opt-in disposable PostgreSQL: real owner-scoped projections and avatar commit. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  readUserProfileRow,
  upsertProfileFields,
  readProfileActorExists,
  readUserIdByUsernameRow,
  readPublicProfileRow,
  replaceProfileAvatarRow,
  readUserWithTrainingsRow,
  readUserProfileForApiRow,
  readOnboardingTourStatusRow,
  markOnboardingTourSeenRow,
} from "./profileRows.js";
const url = process.env.DATABASE_URL ?? "";
const active =
  process.env.GAFUS_PROFILE_REAL_PG === "enabled" &&
  /^postgresql:\/\/profileqa@127\.0\.0\.1:\d+\/gafus_profile_rows_qa\?schema=public$/.test(url);
const suite = active ? describe : describe.skip;
const ids = { owner: "profile_owner_qa", other: "profile_other_qa" };
const birthDate = new Date("2004-03-20T00:00:00Z");

suite("real PostgreSQL profile persistence privacy and avatar ownership", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: ids.owner,
          username: "profile-owner",
          password: "nonlogin",
          email: "owner@synthetic.test",
          role: "TRAINER",
        },
        {
          id: ids.other,
          username: "profile-other",
          password: "nonlogin",
          email: "other@synthetic.test",
          role: "USER",
        },
      ],
    });
    await prisma.pet.createMany({
      data: [
        {
          ownerId: ids.owner,
          name: "Visible",
          type: "DOG",
          breed: "Mix",
          birthDate,
          showInProfile: true,
        },
        {
          ownerId: ids.owner,
          name: "Private",
          type: "DOG",
          breed: "Mix",
          birthDate,
          showInProfile: false,
        },
      ],
    });
    await prisma.course.createMany({
      data: [
        {
          authorId: ids.owner,
          name: "Shown course",
          type: "profile_qa_public",
          duration: "1",
          logoImg: "",
          trainingLevel: "BEGINNER",
          showInProfile: true,
        },
        {
          authorId: ids.owner,
          name: "Hidden course",
          type: "profile_qa_hidden",
          duration: "1",
          logoImg: "",
          trainingLevel: "BEGINNER",
          showInProfile: false,
        },
      ],
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it("profile upsert preserves omitted fields and routes only the correct principal", async () => {
    await upsertProfileFields(
      ids.owner,
      { city: "Kazan", birthDate },
      { user: { connect: { id: ids.owner } }, city: "Kazan", birthDate },
    );
    expect((await readUserProfileRow(ids.owner))?.city).toBe("Kazan");
    expect((await readUserProfileRow(ids.owner))?.birthDate).toEqual(birthDate);
    await upsertProfileFields(
      ids.owner,
      { about: "My dog" },
      { user: { connect: { id: ids.owner } }, about: "My dog" },
    );
    expect((await readUserProfileRow(ids.owner))?.city).toBe("Kazan");
    expect(await readUserProfileRow(ids.other)).toBeNull();
    expect((await readProfileActorExists(ids.owner))?.id).toBe(ids.owner);
    expect((await readUserIdByUsernameRow("profile-owner"))?.id).toBe(ids.owner);
    expect(await readUserIdByUsernameRow("unmatched")).toBeNull();
  });
  it("public profile lookup must not include private pets/courses or credentials", async () => {
    const user = await readPublicProfileRow("profile-owner");
    expect(user?.pets.map((p) => p.name)).toEqual(["Visible"]);
    expect(user?.authoredCourses.map((c) => c.name)).toEqual(["Shown course"]);
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("email");
    expect((await readPublicProfileRow(ids.owner))?.id).toBe(ids.owner);
    expect(await readPublicProfileRow("no-such-person")).toBeNull();
  });
  it("avatar commit returns previous URL and rejects nonexistent owners in locked transaction", async () => {
    expect(await replaceProfileAvatarRow(ids.owner, "avatar1.jpg")).toBeNull();
    expect(await replaceProfileAvatarRow(ids.owner, "avatar2.jpg")).toBe("avatar1.jpg");
    expect((await readUserProfileRow(ids.owner))?.avatarUrl).toBe("avatar2.jpg");
    await expect(replaceProfileAvatarRow("does-not-exist", "leak.jpg")).rejects.toThrow(
      "Пользователь не найден",
    );
    expect(await readUserProfileRow("does-not-exist")).toBeNull();
  });
  it("owner-only API profile, onboarding and course list never cross to another account", async () => {
    const api = await readUserProfileForApiRow(ids.owner);
    expect(api?.id).toBe(ids.owner);
    expect(api?.profile?.city).toBe("Kazan");
    expect(api).not.toHaveProperty("password");
    expect((await readUserWithTrainingsRow(ids.owner))?.username).toBe("profile-owner");
    expect((await readOnboardingTourStatusRow(ids.owner))?.onboardingTourCompletedAt).toBeNull();
    expect((await markOnboardingTourSeenRow(ids.owner)).onboardingTourCompletedAt).toBeInstanceOf(
      Date,
    );
    expect((await readOnboardingTourStatusRow(ids.other))?.onboardingTourCompletedAt).toBeNull();
  });
});
