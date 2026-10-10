import { describe, expect, it, vi } from "vitest";
import { assignSmartExperiment } from "./smart-experiment";
import { getSmartExperimentReport, wilson95 } from "./smart-experiment-report";
import type { FeedDb } from "./ports";

describe("smart feed user-level experiment", () => {
  it("does not enroll users unless enabled and percent is valid", () => {
    expect(assignSmartExperiment("user", { enabled: false, enrollmentPercent: 100, treatmentPercent: 50 })).toBe("off");
    expect(assignSmartExperiment("user", { enabled: true, enrollmentPercent: 0, treatmentPercent: 50 })).toBe("off");
    expect(assignSmartExperiment("user", { enabled: true, enrollmentPercent: 101, treatmentPercent: 50 })).toBe("off");
    expect(assignSmartExperiment("user", { enabled: true, enrollmentPercent: 100, treatmentPercent: NaN })).toBe("off");
  });
  it("assigns a stable sticky user cohort across calls and sessions", () => {
    const config = { enabled: true, enrollmentPercent: 100, treatmentPercent: 50 };
    const first = assignSmartExperiment("user-123", config);
    expect(first).toBe(assignSmartExperiment("user-123", config));
    expect(["control", "treatment"]).toContain(first);
    expect(assignSmartExperiment("user-123", { ...config, treatmentPercent: 0 })).toBe("control");
    expect(assignSmartExperiment("user-123", { ...config, treatmentPercent: 100 })).toBe("treatment");
  });
  it("produces approximately balanced cohorts without per-request randomness", () => {
    const counts = { control: 0, treatment: 0, off: 0 };
    for (let i = 0; i < 1000; i += 1) {
      counts[assignSmartExperiment(String(i), {
        enabled: true, enrollmentPercent: 100, treatmentPercent: 50,
      })] += 1;
    }
    expect(counts.off).toBe(0);
    expect(counts.control).toBeGreaterThan(400);
    expect(counts.treatment).toBeGreaterThan(400);
  });
  it("uses user-level metrics and honest uncertainty intervals", async () => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([
        { variant: "control", users: 100, engagedUsers: 12, negativeUsers: 2, postsExposed: 30, authorsExposed: 12 },
        { variant: "treatment", users: 100, engagedUsers: 18, negativeUsers: 3, postsExposed: 40, authorsExposed: 19 },
      ]),
    } as unknown as FeedDb;
    const report = await getSmartExperimentReport(db, new Date("2026-10-10T12:00:00Z"));
    expect(report.arms).toHaveLength(2);
    expect(report.arms[1]?.engagementRate).toBeCloseTo(0.18);
    expect(report.comparison?.relativeLift).toBeCloseTo(0.5);
    expect(report.comparison?.eligibleForDecision).toBe(false);
    expect(report.comparison?.confidenceInterval95[0]).toBeLessThan(0);
    expect(wilson95(0, 10)[0]).toBe(0);
    expect(wilson95(10, 10)[1]).toBeCloseTo(1);
  });
  it("does not claim results when data is insufficient", async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as FeedDb;
    expect((await getSmartExperimentReport(db)).comparison).toBeNull();
  });
});
