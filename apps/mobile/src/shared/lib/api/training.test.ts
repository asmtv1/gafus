import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { trainingApi } from "./training";

vi.mock("./client", () => ({
  apiClient: vi.fn(),
}));

describe("trainingApi", () => {
  beforeEach(() => {
    vi.mocked(apiClient).mockResolvedValue({ success: true, data: undefined });
  });

  it("does not open the global paywall while passively loading diary entries", async () => {
    await trainingApi.getDiaryEntries("course-1");

    expect(apiClient).toHaveBeenCalledWith("/api/v1/training/diary?courseId=course-1", {
      suppressSubscriptionPaywall: true,
    });
  });
});
