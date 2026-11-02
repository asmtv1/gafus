import { beforeEach, describe, expect, it, vi } from "vitest";
const spies = vi.hoisted(() => ({ days: vi.fn(), steps: vi.fn(), users: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: {
  trainingDay: { count: spies.days }, step: { count: spies.steps }, user: { count: spies.users },
} }));
import {
  countOwnedTrainingDays, countOwnedTrainingSteps, countExistingCourseUsers,
  countEditableCourseDays, countEditableDaySteps,
} from "./editorCountQueries";
beforeEach(() => { vi.clearAllMocks(); for (const count of Object.values(spies)) count.mockResolvedValue(2); });
describe("trainer-authoring membership checks in Core", () => {
  it("restricts non-elevated day and step ownership", async () => {
    await countOwnedTrainingDays(["day1"], "trainer", false);
    await countOwnedTrainingSteps(["step1"], "trainer", false);
    expect(spies.days).toHaveBeenCalledWith({ where: { id: { in: ["day1"] }, authorId: "trainer" } });
    expect(spies.steps).toHaveBeenCalledWith({ where: { id: { in: ["step1"] }, authorId: "trainer" } });
  });
  it("does not silently narrow ADMIN scope", async () => {
    await countOwnedTrainingDays(["day1"], "admin", true);
    await countOwnedTrainingSteps(["step1"], "admin", true);
    expect(spies.days).toHaveBeenCalledWith({ where: { id: { in: ["day1"] } } });
    expect(spies.steps).toHaveBeenCalledWith({ where: { id: { in: ["step1"] } } });
  });
  it("validates allowed users separately from day membership", async () => {
    await countExistingCourseUsers(["user1"]);
    expect(spies.users).toHaveBeenCalledWith({ where: { id: { in: ["user1"] }, role: "USER" } });
  });
  it("limits TRAINER but not ADMIN counts in course editor", async () => {
    await countEditableCourseDays(["day1"], { id: "t", role: "TRAINER" });
    await countEditableDaySteps(["step1"], { id: "a", role: "ADMIN" });
    expect(spies.days).toHaveBeenCalledWith({ where: { id: { in: ["day1"] }, authorId: "t" } });
    expect(spies.steps).toHaveBeenCalledWith({ where: { id: { in: ["step1"] } } });
  });
});
