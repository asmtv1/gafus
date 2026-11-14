/** Admin user role locking and same-transaction rollback on isolated PG only. */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { readAdminUserRole, readAdminUserRoles, readAdminUserListRows } from "./adminUserReads.js";
import { updateAdminUserRows, deleteAdminUserRows } from "./adminUserWrites.js";
const active = process.env.GAFUS_ADMIN_USER_REAL_PG === "enabled" &&
  /^postgresql:\/\/adminuserqa@127\.0\.0\.1:\d+\/gafus_admin_user_qa\?schema=public$/.test(process.env.DATABASE_URL ?? "");
const suite = active ? describe : describe.skip;
const id = { admin: "admin_usr_qa", mod: "mod_usr_qa", user: "target_usr_qa", privileged: "trainer_usr_qa", victim: "victim_usr_qa" };
const denyIfNotAdmin = (actor: string | null) => {
  if (actor !== "ADMIN") throw new Error("ACTOR_ROLE_DENIED");
};

suite("real PG18 locked administrative account mutations", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: [
      { id: id.admin, username: "admin-qa", password: "nonlogin", role: "ADMIN" },
      { id: id.mod, username: "moderator-qa", password: "nonlogin", role: "MODERATOR" },
      { id: id.user, username: "normal-qa", password: "nonlogin", role: "USER" },
      { id: id.privileged, username: "trainer-qa", password: "nonlogin", role: "TRAINER" },
      { id: id.victim, username: "victim-qa", password: "nonlogin", role: "USER" },
    ] });
    await prisma.userProfile.create({ data: { userId: id.user, fullName: "Before" } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("reads exact current SQL roles, no password hash in privileged list", async () => {
    expect(await readAdminUserRoles(id.admin, id.user)).toEqual({ actorRole: "ADMIN", targetRole: "USER" });
    expect(await readAdminUserRole("missing")).toBeNull();
    const listed = await readAdminUserListRows();
    expect(listed.find(row => row.id === id.user)?.role).toBe("USER");
    expect(listed.find(row => row.id === id.user)).not.toHaveProperty("password");
  });
  it("denies a stale moderator role mutation in the same ordered-lock transaction", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: id.user }, select: { role: true, sessionsRevokedAt: true } });
    await expect(updateAdminUserRows(id.user, { role: "ADMIN" }, id.mod, {
      authorize: denyIfNotAdmin,
      bindPartner: async () => { throw Error("SHOULD_NOT_BIND"); },
    })).rejects.toThrow("ACTOR_ROLE_DENIED");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: id.user }, select: { role: true, sessionsRevokedAt: true } })).toEqual(before);
  });
  it("rolls back role+session revocation when a same-transaction partner callback fails", async () => {
    await expect(updateAdminUserRows(id.user, { role: "PARTNER", partnerPromoCodeId: "missing" }, id.admin, {
      authorize: denyIfNotAdmin,
      bindPartner: async (tx, ownerId) => {
        expect((await tx.user.findUnique({ where: { id: ownerId }, select: { role: true } }))?.role).toBe("PARTNER");
        throw Error("BIND_FAILED");
      },
    })).rejects.toThrow("BIND_FAILED");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: id.user }, select: { role: true, sessionsRevokedAt: true } });
    expect(after).toEqual({ role: "USER", sessionsRevokedAt: null });
  });
  it("commits admin password and role changes with durable session revocation", async () => {
    await updateAdminUserRows(id.user, { role: "TRAINER", passwordHash: "synthetic-bcrypt-hash" }, id.admin, {
      authorize: denyIfNotAdmin,
      bindPartner: async () => { throw Error("NO_PARTNER"); },
    });
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: id.user }, select: { role: true, password: true, sessionsRevokedAt: true } });
    expect(updated.role).toBe("TRAINER");
    expect(updated.password).toBe("synthetic-bcrypt-hash");
    expect(updated.sessionsRevokedAt).toBeInstanceOf(Date);
  });
  it("denied deletion does not invoke cleanup or remove a privileged account", async () => {
    let cleanupCalled = false;
    await expect(deleteAdminUserRows(id.privileged, id.mod, (actor, target) => {
      if (actor === "MODERATOR" && target !== "USER") throw Error("DELETE_FORBIDDEN");
    }, async () => { cleanupCalled = true; })).rejects.toThrow("DELETE_FORBIDDEN");
    expect(cleanupCalled).toBe(false);
    expect(await prisma.user.findUnique({ where: { id: id.privileged }, select: { id: true } })).toEqual({ id: id.privileged });
  });
  it("cleanup error rolls back the delete and admin can subsequently delete", async () => {
    await expect(deleteAdminUserRows(id.victim, id.admin, denyIfNotAdmin, async (tx) => {
      await tx.user.update({ where: { id: id.victim }, data: { username: "transient-rename" } });
      throw Error("OUTBOX_FAILED");
    })).rejects.toThrow("OUTBOX_FAILED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: id.victim }, select: { username: true } })).username).toBe("victim-qa");
    let cleanupCalled = false;
    await deleteAdminUserRows(id.victim, id.admin, denyIfNotAdmin, async () => { cleanupCalled = true; });
    expect(cleanupCalled).toBe(true);
    expect(await prisma.user.findUnique({ where: { id: id.victim }, select: { id: true } })).toBeNull();
  });
});
