import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUserId: vi.fn(), loadDays: vi.fn() }));
vi.mock("@shared/utils/getCurrentUserId", () => ({
  getCurrentUserId: mocks.currentUserId,
}));
vi.mock("@gafus/core/services/training/trainingService", () => ({
  getTrainingDays: mocks.loadDays,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));

import { getTrainingDays } from "./getTrainingDays";

describe("Web training days server action authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserId.mockResolvedValue("viewer");
    mocks.loadDays.mockResolvedValue({ trainingDays: [] });
  });

  it("never executes the course query for an injected subscriber user ID", async () => {
    await expect(getTrainingDays("course", "other-subscriber")).rejects.toThrow();
    expect(mocks.loadDays).not.toHaveBeenCalled();
  });

  it("uses the authenticated identity for legitimate requests", async () => {
    await expect(getTrainingDays("course", "viewer")).resolves.toMatchObject({ trainingDays: [] });
    expect(mocks.loadDays).toHaveBeenCalledWith("viewer", "course");
  });
});
