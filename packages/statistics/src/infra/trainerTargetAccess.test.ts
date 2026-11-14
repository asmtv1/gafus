import { beforeEach, describe, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("@gafus/prisma", () => ({ prisma: { user: { findUnique: read } } }));
import { isCurrentTrainerUser } from "./trainerTargetAccess";
beforeEach(() => vi.clearAllMocks());
describe("authoritative trainer target ACL", () => {
  it("reads the current DB role using a bounded projection", async () => {
    read.mockResolvedValueOnce({ role: "TRAINER" });
    await expect(isCurrentTrainerUser("trainer1")).resolves.toBe(true);
    expect(read).toHaveBeenCalledExactlyOnceWith({
      where: { id: "trainer1" }, select: { role: true },
    });
  });
  it.each([{ role: "USER" }, { role: "ADMIN" }, null])(
    "refuses nontrainer and removed targets", async result => {
      read.mockResolvedValueOnce(result);
      await expect(isCurrentTrainerUser("target")).resolves.toBe(false);
    },
  );
});
