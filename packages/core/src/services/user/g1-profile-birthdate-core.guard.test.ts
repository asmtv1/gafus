/** Actual original Core profile update service, synthetic Prisma upsert spy only. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { userProfile: { upsert: db.upsert } } }));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));
vi.mock("../cynologistChat/authorRole", () => ({ getChatDisplayRole: async () => null }));
import { updateUserProfile } from "./profileService";

beforeEach(() => {
  vi.clearAllMocks();
  db.upsert.mockResolvedValue({ userId: "owner-synthetic" });
});

describe("USER020 direct Core profile birthday write boundary", () => {
  it("rejects impossible and future date strings without Prisma writes", async () => {
    const future = new Date(Date.now() + 172_800_000).toISOString().slice(0, 10);
    for (const birthDate of [
      "2021-02-29",
      "2021-02-30",
      future,
      "2021-02-30T00:00:00.000Z",
      `${future}T00:00:00.000Z`,
      "not-a-date",
    ]) {
      await expect(updateUserProfile("owner-synthetic", { birthDate })).rejects.toThrow(
        "Неверная дата",
      );
    }
    expect(db.upsert).not.toHaveBeenCalled();
  });
  it("retains date-only, legacy ISO, empty clear and omission semantics", async () => {
    for (const birthDate of ["2020-02-29", "2020-02-29T00:00:00.000Z"]) {
      await updateUserProfile("owner-synthetic", { birthDate });
      const arg = db.upsert.mock.lastCall?.[0];
      expect(arg.update.birthDate).toEqual(new Date("2020-02-29T00:00:00.000Z"));
      expect(arg.create.birthDate).toEqual(new Date("2020-02-29T00:00:00.000Z"));
    }
    await updateUserProfile("owner-synthetic", { birthDate: "" });
    expect(db.upsert.mock.lastCall?.[0].update.birthDate).toBeNull();
    await updateUserProfile("owner-synthetic", { city: "Самара" });
    expect(db.upsert.mock.lastCall?.[0].update).not.toHaveProperty("birthDate");
  });
});
