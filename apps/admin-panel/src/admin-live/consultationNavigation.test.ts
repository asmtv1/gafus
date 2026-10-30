import { describe, it, expect } from "vitest";
import {
  SCHEDULE_ROUTE,
  trainerIdFromScheduleSearch,
  scheduleTrainerUrl,
  validScheduleTrainerId,
} from "./consultationNavigation";

describe("admin consultations schedule deep links", () => {
  it("opens a real trainer from a direct Next-compatible link", () => {
    expect(trainerIdFromScheduleSearch(SCHEDULE_ROUTE, "?trainerId=trainer_21")).toBe("trainer_21");
    expect(scheduleTrainerUrl("trainer_21")).toBe(`${SCHEDULE_ROUTE}?trainerId=trainer_21`);
  });
  it("does not apply query state to unrelated sections", () => {
    expect(trainerIdFromScheduleSearch("/main-panel/users", "?trainerId=trainer_21")).toBe("");
  });
  it("rejects parameter injection and path delimiters", () => {
    for (const id of [
      "",
      "../../bad",
      "id&tab=admin",
      "id?a=1",
      "user%2Ffoo",
      "123/456",
      "x".repeat(129),
    ]) {
      if (id) expect(validScheduleTrainerId(id)).toBe(false);
      expect(
        trainerIdFromScheduleSearch(SCHEDULE_ROUTE, `?trainerId=${encodeURIComponent(id)}`),
      ).toBe("");
      if (id) expect(() => scheduleTrainerUrl(id)).toThrow("Некорректный ID");
    }
  });
  it("ignores duplicate invalid values and restores a clean picker URL", () => {
    expect(trainerIdFromScheduleSearch(SCHEDULE_ROUTE, "?trainerId=bad%2Fpath")).toBe("");
    expect(scheduleTrainerUrl("")).toBe(SCHEDULE_ROUTE);
  });
});
