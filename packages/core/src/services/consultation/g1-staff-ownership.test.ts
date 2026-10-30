/** G1 characterization of the existing Core ownership resolver (mocked Prisma). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: { user: { findUnique: db.findUnique } },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { resolveTargetTrainerUserIdForStaff } from "./cynologistService";
import { ConsultationForbiddenError } from "./errors";

const trainer = { id: "trainer-A", role: "TRAINER" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  db.findUnique.mockResolvedValue({ role: "TRAINER" });
});

describe("G1 consultation staff owner policy (existing Core implementation, NO DB)", () => {
  it("TRAINER-A defaults to own ID; no database needed", async () => {
    await expect(resolveTargetTrainerUserIdForStaff(trainer, undefined)).resolves.toBe("trainer-A");
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it("TRAINER-A may explicitly address own ID", async () => {
    await expect(resolveTargetTrainerUserIdForStaff(trainer, "trainer-A")).resolves.toBe("trainer-A");
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it("TRAINER-B cannot address TRAINER-A via trainerUserId: forbidden without DB lookup", async () => {
    await expect(resolveTargetTrainerUserIdForStaff({ id: "trainer-B", role: "TRAINER" }, "trainer-A"))
      .rejects.toBeInstanceOf(ConsultationForbiddenError);
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it.each(["USER", "PARTNER"] as const)("denies %s even if a trainer target is given", async role => {
    await expect(resolveTargetTrainerUserIdForStaff({ id: role, role }, "trainer-A"))
      .rejects.toBeInstanceOf(ConsultationForbiddenError);
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it.each(["ADMIN"] as const)("%s requires an explicit target", async role => {
    await expect(resolveTargetTrainerUserIdForStaff({ id: role, role }, undefined))
      .rejects.toBeInstanceOf(ConsultationForbiddenError);
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it.each(["ADMIN"] as const)("%s can target a confirmed TRAINER in current policy", async role => {
    await expect(resolveTargetTrainerUserIdForStaff({ id: role, role }, "trainer-A"))
      .resolves.toBe("trainer-A");
    expect(db.findUnique).toHaveBeenCalledWith({
      where: { id: "trainer-A" }, select: { role: true },
    });
  });

  it.each([undefined, "trainer-A"])("MODERATOR cannot request schedule target %s", async target => {
    await expect(resolveTargetTrainerUserIdForStaff({ id: "mod-A", role: "MODERATOR" }, target))
      .rejects.toBeInstanceOf(ConsultationForbiddenError);
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it("rejects non-TRAINER target even for an ADMIN", async () => {
    db.findUnique.mockResolvedValueOnce({ role: "USER" });
    await expect(resolveTargetTrainerUserIdForStaff({ id: "admin-A", role: "ADMIN" }, "user-A"))
      .rejects.toBeInstanceOf(ConsultationForbiddenError);
  });

  it("rejects unknown target even for an ADMIN", async () => {
    db.findUnique.mockResolvedValueOnce(null);
    await expect(resolveTargetTrainerUserIdForStaff({ id: "admin-A", role: "ADMIN" }, "missing-trainer"))
      .rejects.toBeInstanceOf(ConsultationForbiddenError);
  });
});
