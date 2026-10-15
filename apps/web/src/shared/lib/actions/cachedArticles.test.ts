import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUserId: vi.fn(), getArticles: vi.fn() }));
vi.mock("@shared/utils/getCurrentUserId", () => ({
  getCurrentUserId: mocks.currentUserId,
}));
vi.mock("@gafus/core/services/article", () => ({
  getArticles: mocks.getArticles,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));

import { getArticlesCached } from "./cachedArticles";

describe("Web article list authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserId.mockResolvedValue("viewer");
    mocks.getArticles.mockResolvedValue({ success: true, data: [] });
  });

  it("rejects an injected subscriber ID without requesting private media", async () => {
    await expect(getArticlesCached("other-subscriber")).resolves.toMatchObject({ success: false });
    expect(mocks.getArticles).not.toHaveBeenCalled();
  });

  it("derives article entitlement only from the viewer session", async () => {
    await expect(getArticlesCached("viewer")).resolves.toMatchObject({ success: true });
    expect(mocks.getArticles).toHaveBeenCalledWith("viewer");
  });

  it("preserves the public catalog for anonymous visitors", async () => {
    mocks.currentUserId.mockRejectedValue(new Error("no session"));
    await expect(getArticlesCached()).resolves.toMatchObject({ success: true });
    expect(mocks.getArticles).toHaveBeenCalledWith(undefined);
  });
});
