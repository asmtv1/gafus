import { describe, expect, it } from "vitest";

import { TrainingStatus } from "../utils/training-status";

import { calculateDayStatusFromStatuses } from "./statusCalculations";

describe("calculateDayStatusFromStatuses", () => {
  it("возвращает NOT_STARTED для пустого массива", () => {
    expect(calculateDayStatusFromStatuses([])).toBe(TrainingStatus.NOT_STARTED);
  });

  it("возвращает COMPLETED когда все шаги COMPLETED", () => {
    expect(
      calculateDayStatusFromStatuses([
        TrainingStatus.COMPLETED,
        TrainingStatus.COMPLETED,
      ]),
    ).toBe(TrainingStatus.COMPLETED);
  });

  it("возвращает IN_PROGRESS при наличии IN_PROGRESS", () => {
    expect(
      calculateDayStatusFromStatuses([
        TrainingStatus.NOT_STARTED,
        TrainingStatus.IN_PROGRESS,
      ]),
    ).toBe(TrainingStatus.IN_PROGRESS);
  });

  it("возвращает IN_PROGRESS при наличии PAUSED", () => {
    expect(
      calculateDayStatusFromStatuses([
        TrainingStatus.NOT_STARTED,
        "PAUSED",
      ]),
    ).toBe(TrainingStatus.IN_PROGRESS);
  });

  it("возвращает IN_PROGRESS при наличии COMPLETED (но не все)", () => {
    expect(
      calculateDayStatusFromStatuses([
        TrainingStatus.COMPLETED,
        TrainingStatus.NOT_STARTED,
      ]),
    ).toBe(TrainingStatus.IN_PROGRESS);
  });

  it("возвращает RESET при наличии RESET без активных", () => {
    expect(
      calculateDayStatusFromStatuses(["RESET", TrainingStatus.NOT_STARTED]),
    ).toBe("RESET");
  });

  it("возвращает RESET когда все шаги RESET", () => {
    expect(calculateDayStatusFromStatuses(["RESET", "RESET"])).toBe("RESET");
  });

  it("возвращает IN_PROGRESS при RESET + IN_PROGRESS (приоритет активных)", () => {
    expect(
      calculateDayStatusFromStatuses([
        "RESET",
        TrainingStatus.IN_PROGRESS,
      ]),
    ).toBe(TrainingStatus.IN_PROGRESS);
  });

  it("возвращает NOT_STARTED когда все NOT_STARTED", () => {
    expect(
      calculateDayStatusFromStatuses([
        TrainingStatus.NOT_STARTED,
        TrainingStatus.NOT_STARTED,
      ]),
    ).toBe(TrainingStatus.NOT_STARTED);
  });

  it("нормализует строковые статусы", () => {
    expect(
      calculateDayStatusFromStatuses(["RESET", "NOT_STARTED"]),
    ).toBe("RESET");
  });
});
