import { beforeEach, expect, it, vi } from "vitest";
const find = vi.hoisted(() => vi.fn());
vi.mock("@gafus/prisma", () => ({ prisma: { trainerVideo: { findMany: find } } }));
import { readTrainerVideoMetadataRows } from "./readTrainerVideoMetadataRows";
beforeEach(() => { vi.clearAllMocks(); find.mockResolvedValue([]); });
it("TRAINER selection is scoped by own ID and excludes private paths", async () => {
  await readTrainerVideoMetadataRows({ id: "owner", role: "TRAINER" });
  expect(find).toHaveBeenCalledExactlyOnceWith({
    where: { trainerId: "owner" }, orderBy: { createdAt: "desc" },
    select: { id: true, displayName: true, transcodingStatus: true, durationSec: true, createdAt: true },
  });
});
it("ADMIN selection preserves original global scope", async () => {
  await readTrainerVideoMetadataRows({ id: "admin", role: "ADMIN" });
  expect(find.mock.calls[0][0].where).toBeUndefined();
});
