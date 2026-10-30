import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findNotification: vi.fn(),
  belongsToDay: vi.fn(),
  currentUserStep: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    stepNotification: { findUnique: m.findNotification },
    dayOnCourse: { findFirst: m.belongsToDay },
    userStep: { findFirst: m.currentUserStep },
  },
}));
import {
  getEligiblePushNotificationJob,
  getPushNotificationForDelivery,
} from "./pushWorkerService";

const original = {
  id: "n1",
  jobId: "j1",
  sent: false,
  paused: false,
  userId: "owner",
  dayOnCourseId: "dayA",
  stepOnDayId: "occB",
  originalStepId: "stepB",
  type: "step",
};
describe("bound StepNotification delivery must match persisted owner/day/step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.findNotification.mockResolvedValue(original);
    m.belongsToDay.mockResolvedValue({ id: "dayA" });
    m.currentUserStep.mockResolvedValue({ id: "owner-progress-B" });
  });
  it("allows current stable occurrence without relying on positional day/index", async () => {
    expect(await getEligiblePushNotificationJob("n1", "j1")).toMatchObject({
      id: "n1",
      jobId: "j1",
    });
    expect(m.belongsToDay).toHaveBeenCalledWith({
      where: {
        id: "dayA",
        day: {
          stepLinks: {
            some: {
              id: "occB",
              stepId: "stepB",
            },
          },
        },
      },
      select: { id: true },
    });
    expect(m.currentUserStep).toHaveBeenCalledWith({
      where: {
        stepOnDayId: "occB",
        userTraining: { userId: "owner", dayOnCourseId: "dayA" },
        status: "IN_PROGRESS",
        paused: false,
      },
      select: { id: true },
    });
  });
  it("rejects moved/deleted/rewritten occurrence before external push", async () => {
    m.belongsToDay.mockResolvedValueOnce(null);
    expect(await getEligiblePushNotificationJob("n1", "j1")).toBeNull();
    m.belongsToDay.mockResolvedValueOnce(null);
    expect(await getPushNotificationForDelivery("n1")).toBeNull();
  });
  it("rejects expired, completed, paused, or foreign owner's progress", async () => {
    m.currentUserStep.mockResolvedValueOnce(null);
    expect(await getEligiblePushNotificationJob("n1", "j1")).toBeNull();
    m.currentUserStep.mockResolvedValueOnce(null);
    expect(await getPushNotificationForDelivery("n1")).toBeNull();
  });
  it("rejects only half-migrated bound identity without unsafe fallback", async () => {
    m.findNotification.mockResolvedValueOnce({ ...original, originalStepId: null });
    expect(await getEligiblePushNotificationJob("n1", "j1")).toBeNull();
    expect(m.belongsToDay).not.toHaveBeenCalled();
  });
  it("preserves old positional native notifications unchanged", async () => {
    m.findNotification.mockResolvedValueOnce({
      ...original,
      dayOnCourseId: null,
      stepOnDayId: null,
      originalStepId: null,
    });
    expect(await getEligiblePushNotificationJob("n1", "j1")).toMatchObject({ id: "n1" });
    expect(m.belongsToDay).not.toHaveBeenCalled();
    expect(m.currentUserStep).not.toHaveBeenCalled();
  });
});
