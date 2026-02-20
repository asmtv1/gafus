import { describe, expect, it } from "vitest";

import {
  calculateAchievements,
  type AchievementStats,
} from "./calculateAchievements";

const baseStats: AchievementStats = {
  totalCourses: 0,
  completedCourses: 0,
  inProgressCourses: 0,
  totalCompletedDays: 0,
  totalDays: 0,
  overallProgress: 0,
  totalTrainingTime: 0,
  averageCourseProgress: 0,
  longestStreak: 0,
  currentStreak: 0,
};

describe("calculateAchievements", () => {
  it("returns empty array for null/undefined", () => {
    expect(calculateAchievements(null as unknown as AchievementStats)).toEqual(
      [],
    );
  });

  it("returns all achievements for zero stats, all unlocked false", () => {
    const result = calculateAchievements(baseStats);
    expect(result.length).toBeGreaterThanOrEqual(10);
    expect(result.every((a) => !a.unlocked)).toBe(true);
    expect(result.every((a) => a.progress === 0)).toBe(true);
  });

  it("unlocks first-course when totalCourses >= 1", () => {
    const result = calculateAchievements({
      ...baseStats,
      totalCourses: 1,
    });
    const first = result.find((a) => a.id === "first-course");
    expect(first?.unlocked).toBe(true);
  });

  it("unlocks course-master when completedCourses >= 5", () => {
    const result = calculateAchievements({
      ...baseStats,
      completedCourses: 5,
    });
    const master = result.find((a) => a.id === "course-master");
    expect(master?.unlocked).toBe(true);
  });

  it("unlocks course-expert when completedCourses >= 10", () => {
    const result = calculateAchievements({
      ...baseStats,
      completedCourses: 10,
    });
    const expert = result.find((a) => a.id === "course-expert");
    expect(expert?.unlocked).toBe(true);
  });

  it("unlocks streak-7 when currentStreak >= 7", () => {
    const result = calculateAchievements({
      ...baseStats,
      currentStreak: 7,
    });
    const streak7 = result.find((a) => a.id === "streak-7");
    expect(streak7?.unlocked).toBe(true);
    const streak30 = result.find((a) => a.id === "streak-30");
    expect(streak30?.unlocked).toBe(false);
  });

  it("unlocks progress-achiever when overallProgress >= 50", () => {
    const result = calculateAchievements({
      ...baseStats,
      overallProgress: 50,
    });
    const achiever = result.find((a) => a.id === "progress-achiever");
    expect(achiever?.unlocked).toBe(true);
  });

  it("unlocks dedicated-learner when totalTrainingTime >= 6000", () => {
    const result = calculateAchievements({
      ...baseStats,
      totalTrainingTime: 6000,
    });
    const learner = result.find((a) => a.id === "dedicated-learner");
    expect(learner?.unlocked).toBe(true);
  });

  it("each achievement has id, title, description, icon, progress, category", () => {
    const result = calculateAchievements(baseStats);
    for (const a of result) {
      expect(a).toHaveProperty("id");
      expect(a).toHaveProperty("title");
      expect(a).toHaveProperty("description");
      expect(a).toHaveProperty("icon");
      expect(a).toHaveProperty("progress");
      expect(a).toHaveProperty("category");
      expect(a.progress).toBeGreaterThanOrEqual(0);
      expect(a.progress).toBeLessThanOrEqual(100);
    }
  });
});
