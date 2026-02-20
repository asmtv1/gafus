import { describe, expect, it, beforeEach, vi } from "vitest";

import { getPresentationStats } from "./adminPresentationService";

const mockPresentationViewCount = vi.fn();
const mockPresentationViewGroupBy = vi.fn();
const mockPresentationViewAggregate = vi.fn();
const mockPresentationViewFindMany = vi.fn();
const mockPresentationEventCount = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    presentationView: {
      count: (...args: unknown[]) => mockPresentationViewCount(...args),
      groupBy: (...args: unknown[]) => mockPresentationViewGroupBy(...args),
      aggregate: (...args: unknown[]) => mockPresentationViewAggregate(...args),
      findMany: (...args: unknown[]) => mockPresentationViewFindMany(...args),
    },
    presentationEvent: {
      count: (...args: unknown[]) => mockPresentationEventCount(...args),
    },
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("getPresentationStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPresentationViewCount.mockResolvedValue(5);
    mockPresentationEventCount.mockResolvedValue(3);
    mockPresentationViewGroupBy.mockImplementation((args: { by: string[] }) => {
      const by = args.by as string[];
      if (by[0] === "sessionId") {
        return Promise.resolve([{ sessionId: "s1", _count: { id: 1 } }, { sessionId: "s2", _count: { id: 1 } }]);
      }
      if (by[0] === "visitorId") {
        return Promise.resolve([{ visitorId: "v1", _count: { id: 1 } }]);
      }
      if (by[0] === "referrerDomain" && !by[1]) {
        if ("_avg" in args && args._avg && "timeOnPage" in (args._avg as object)) {
          return Promise.resolve([
            { referrerDomain: "google.com", _count: { id: 3 }, _avg: { timeOnPage: 120 } },
          ]);
        }
        return Promise.resolve([
          { referrerDomain: "google.com", _count: { id: 2 } },
        ]);
      }
      if (by.includes("sessionId") && by.includes("referrerDomain")) {
        return Promise.resolve([
          { referrerDomain: "google.com", sessionId: "s1" },
        ]);
      }
      if (by[0] === "utmSource") {
        return Promise.resolve([
          { utmSource: "google", utmMedium: "cpc", utmCampaign: "spring", _count: { id: 1 } },
        ]);
      }
      if (by[0] === "deviceType") {
        return Promise.resolve([
          { deviceType: "mobile", _count: { id: 5 }, _avg: { timeOnPage: 90 } },
        ]);
      }
      return Promise.resolve([]);
    });
    mockPresentationViewAggregate.mockImplementation((args: Record<string, unknown>) => {
      if ("_avg" in args && args._avg && typeof args._avg === "object" && "timeOnPage" in (args._avg as object)) {
        return Promise.resolve({ _avg: { timeOnPage: 120 }, _sum: {} });
      }
      if ("_avg" in args && args._avg && typeof args._avg === "object" && "scrollDepth" in (args._avg as object)) {
        return Promise.resolve({ _avg: { scrollDepth: 65 }, _sum: {} });
      }
      if ("_sum" in args && args._sum && typeof args._sum === "object" && "timeOnPage" in (args._sum as object)) {
        return Promise.resolve({ _sum: { timeOnPage: 600 }, _avg: {} });
      }
      return Promise.resolve({ _sum: { ctaClicks: 6 }, _avg: {} });
    });
    mockPresentationViewFindMany.mockImplementation((args: { take?: number }) => {
      if (args?.take === 50) {
        return Promise.resolve([
          {
            id: "v-1",
            sessionId: "s1",
            referrer: "https://google.com",
            referrerDomain: "google.com",
            timeOnPage: 200,
            scrollDepth: 75,
            ctaClicks: 2,
            deviceType: "mobile",
            firstViewAt: new Date("2024-01-01T14:30:00"),
            lastViewAt: new Date("2024-01-01T15:00:00"),
          },
        ]);
      }
      return Promise.resolve([
        { firstViewAt: new Date("2024-01-01T14:00:00") },
      ]);
    });
  });

  it("returns stats on success", async () => {
    const result = await getPresentationStats();

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("computes avgClicksPerSession when uniqueSessions > 0", async () => {
    const result = await getPresentationStats();

    expect(result.success).toBe(true);
    expect(result.data?.engagement.avgClicksPerSession).toBe(3);
  });

  it("populates recentViews with correct fields", async () => {
    const result = await getPresentationStats();

    expect(result.success).toBe(true);
    expect(result.data?.recentViews).toHaveLength(1);
    expect(result.data?.recentViews[0].sessionId).toBe("s1");
  });

  it("populates byReferrer with domain and metrics", async () => {
    const result = await getPresentationStats();

    expect(result.success).toBe(true);
    expect(result.data?.byReferrer[0].domain).toBe("google.com");
    expect(result.data?.byReferrer[0].views).toBe(3);
    expect(result.data?.byReferrer[0].uniqueSessions).toBe(1);
  });

  it("populates timeDistribution array of 24 hours", async () => {
    const result = await getPresentationStats();

    expect(result.success).toBe(true);
    expect(result.data?.timeDistribution).toHaveLength(24);
    expect(result.data?.timeDistribution[14].views).toBe(1);
  });

  it("returns error on prisma failure", async () => {
    mockPresentationViewCount.mockRejectedValue(new Error("DB error"));

    const result = await getPresentationStats();

    expect(result.success).toBe(false);
  });
});
