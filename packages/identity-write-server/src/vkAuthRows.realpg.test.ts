import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  readVkUserEmail,
  readVkEmailOwner,
  readDetailedVkAccount,
  readVkUsernameCollision,
  upsertLinkedVkProfile,
  createPendingVkAccount,
  readVkLinkedAccountOwner,
  linkVkAccountAndMergeProfile,
} from "./vkAuthRows";

const suite = describe.runIf(process.env.GAFUS_VK_AUTH_ROWS_REAL_PG === "enabled");
const owner = "vk-auth-rows-qa-owner";
const providerId = "vk-auth-rows-qa-provider";
let isolated = false;
suite("VK identity SQL on disposable local PostgreSQL18", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_vk_auth_rows_qa");
    const info = await prisma.$queryRawUnsafe<{ db: string; v: number }[]>(
      "SELECT current_database() AS db, current_setting('server_version_num')::integer AS v",
    );
    expect(info[0]?.db).toBe("gafus_vk_auth_rows_qa");
    expect(info[0]?.v).toBeGreaterThanOrEqual(180000);
    isolated = true;
    await prisma.user.create({
      data: {
        id: owner,
        username: owner,
        password: "fictional-test-only",
        role: "USER",
        email: "vk-owner@synthetic.test",
      },
    });
  });
  afterAll(async () => {
    if (!isolated) return;
    await prisma.account.deleteMany({
      where: { provider: "vk", providerAccountId: { in: [providerId, "new-vk-provider"] } },
    });
    await prisma.user.deleteMany({ where: { username: { in: [owner, "vk-new-user"] } } });
    await prisma.$disconnect();
  });
  it("resolves only matching email and existing username", async () => {
    expect((await readVkUserEmail(owner))?.email).toBe("vk-owner@synthetic.test");
    expect((await readVkEmailOwner("vk-owner@synthetic.test"))?.id).toBe(owner);
    expect((await readVkUsernameCollision(owner))?.id).toBe(owner);
    expect(await readVkLinkedAccountOwner(providerId)).toBeNull();
  });
  it("two simultaneous callbacks create one linked principal with one row lock", async () => {
    const create = () =>
      createPendingVkAccount(
        "vk-new-user",
        "vk_new_provider",
        "synthetic-password",
        "UNKNOWN",
        undefined,
        providerId,
        { fullName: "Public Name", birthDate: null, avatarUrl: null },
      );
    const outcomes = await Promise.all([create(), create()]);
    expect(outcomes.filter((x) => x.created)).toHaveLength(1);
    const linked = await readDetailedVkAccount(providerId);
    expect(linked?.user.username).toBe("vk-new-user");
    expect((await readVkLinkedAccountOwner(providerId))?.userId).toBe(linked?.userId);
    expect(
      await prisma.account.count({ where: { provider: "vk", providerAccountId: providerId } }),
    ).toBe(1);
  });
  it("maintains owner-scoped profile fields without overriding existing values", async () => {
    const linked = await readDetailedVkAccount(providerId);
    expect(linked).not.toBeNull();
    await upsertLinkedVkProfile(
      linked!.userId,
      { fullName: "New Profile", birthDate: null, avatarUrl: "https://synthetic.invalid/avatar" },
      { avatarUrl: "https://synthetic.invalid/avatar" },
    );
    const profile = await prisma.userProfile.findUnique({ where: { userId: linked!.userId } });
    expect(profile?.fullName).toBe("Public Name");
    expect(profile?.avatarUrl).toBe("https://synthetic.invalid/avatar");
  });
  it("linking a different VK provider to an existing owner is atomic", async () => {
    await linkVkAccountAndMergeProfile(owner, "new-vk-provider", {
      fullName: "VK Full Name",
      birthDate: null,
      avatarUrl: null,
    });
    expect((await readVkLinkedAccountOwner("new-vk-provider"))?.userId).toBe(owner);
    await expect(
      linkVkAccountAndMergeProfile(owner, "new-vk-provider", {
        fullName: "Other",
        birthDate: null,
        avatarUrl: null,
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(
      await prisma.account.count({
        where: { provider: "vk", providerAccountId: "new-vk-provider" },
      }),
    ).toBe(1);
  });
});
