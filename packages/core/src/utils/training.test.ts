import { describe, expect, it } from "vitest";

import { TrainingStatus } from "@gafus/types";

import {
  getStepDisplayStatus,
  getDayDisplayStatus,
  getDayKey,
  getStepKey,
  getStepTimerEndStorageKey,
  getStepTimerPauseStorageKey,
  getDayStepKeyPrefix,
  estimateDayDurations,
  isStepWithTimer,
  shouldShowEstimatedDuration,
  getDayTitle,
  formatTimeLeft,
  statusRank,
  calculateDayStatus,
  calculateCourseStatus,
  calculateCourseStatusFromDayStatuses,
} from "./training";

describe("getDayDisplayStatus", () => {
  it("RESET имеет приоритет над серверным COMPLETED", () => {
    expect(
      getDayDisplayStatus(TrainingStatus.RESET, "COMPLETED"),
    ).toBe(TrainingStatus.RESET);
  });

  it("берёт максимум между local и server", () => {
    expect(
      getDayDisplayStatus(TrainingStatus.NOT_STARTED, "COMPLETED"),
    ).toBe(TrainingStatus.COMPLETED);
    expect(
      getDayDisplayStatus(TrainingStatus.IN_PROGRESS, "NOT_STARTED"),
    ).toBe(TrainingStatus.IN_PROGRESS);
  });
});

describe("getStepDisplayStatus", () => {
  it("возвращает локальный статус если он есть", () => {
    const result = getStepDisplayStatus(
      { status: "IN_PROGRESS" },
      { status: "NOT_STARTED", isPausedOnServer: true },
    );
    expect(result).toBe(TrainingStatus.IN_PROGRESS);
  });

  it("игнорирует пустую строку в localState", () => {
    const result = getStepDisplayStatus({ status: "  " }, { status: "COMPLETED" });
    expect(result).toBe(TrainingStatus.COMPLETED);
  });

  it("возвращает PAUSED если isPausedOnServer=true", () => {
    const result = getStepDisplayStatus(
      null,
      { status: "IN_PROGRESS", isPausedOnServer: true },
    );
    expect(result).toBe(TrainingStatus.PAUSED);
  });

  it("fallback на серверный статус", () => {
    const result = getStepDisplayStatus(undefined, { status: "COMPLETED" });
    expect(result).toBe(TrainingStatus.COMPLETED);
  });

  it("возвращает NOT_STARTED по умолчанию", () => {
    const result = getStepDisplayStatus(null, {});
    expect(result).toBe(TrainingStatus.NOT_STARTED);
  });

  it("приоритет RESET с сервера — убирает вспышку «На паузе» до initializeStep", () => {
    expect(
      getStepDisplayStatus(
        { status: "PAUSED" },
        { status: "RESET", isPausedOnServer: true },
      ),
    ).toBe(TrainingStatus.RESET);
    expect(
      getStepDisplayStatus(undefined, { status: "RESET", isPausedOnServer: true }),
    ).toBe(TrainingStatus.RESET);
  });
});

describe("getDayKey", () => {
  it("returns courseId-dayId format", () => {
    expect(getDayKey("course-1", "day-1")).toBe("course-1-day-1");
  });
});

describe("getStepKey", () => {
  it("returns courseId-dayId-index format", () => {
    expect(getStepKey("course-1", "day-1", 0)).toBe("course-1-day-1-0");
    expect(getStepKey("course-1", "day-1", 5)).toBe("course-1-day-1-5");
  });
});

describe("getStepTimerEndStorageKey", () => {
  it("returns training-prefix format", () => {
    expect(getStepTimerEndStorageKey("c1", "d1", 0)).toBe("training-c1-d1-0-end");
  });
});

describe("getStepTimerPauseStorageKey", () => {
  it("returns training-prefix format", () => {
    expect(getStepTimerPauseStorageKey("c1", "d1", 0)).toBe("training-c1-d1-0-paused");
  });
});

describe("getDayStepKeyPrefix", () => {
  it("returns courseId-dayId- format", () => {
    expect(getDayStepKeyPrefix("c1", "d1")).toBe("c1-d1-");
  });
});

describe("estimateDayDurations", () => {
  it("returns zeros for empty array", () => {
    expect(estimateDayDurations([])).toEqual({
      trainingMinutes: 0,
      theoryMinutes: 0,
    });
  });

  it("adds TRAINING durationSec to training", () => {
    expect(
      estimateDayDurations([{ type: "TRAINING", durationSec: 120 }]),
    ).toEqual({ trainingMinutes: 2, theoryMinutes: 0 });
  });

  it("adds PRACTICE estimatedDurationSec to training", () => {
    expect(
      estimateDayDurations([{ type: "PRACTICE", estimatedDurationSec: 90 }]),
    ).toEqual({ trainingMinutes: 2, theoryMinutes: 0 });
  });

  it("skips BREAK and DIARY", () => {
    expect(
      estimateDayDurations([
        { type: "BREAK" },
        { type: "DIARY" },
      ]),
    ).toEqual({ trainingMinutes: 0, theoryMinutes: 0 });
  });

  it("adds THEORY estimatedDurationSec to theory", () => {
    expect(
      estimateDayDurations([{ type: "THEORY", estimatedDurationSec: 300 }]),
    ).toEqual({ trainingMinutes: 0, theoryMinutes: 5 });
  });

  it("handles mixed step types", () => {
    expect(
      estimateDayDurations([
        { type: "TRAINING", durationSec: 60 },
        { type: "PRACTICE", estimatedDurationSec: 60 },
        { type: "THEORY", estimatedDurationSec: 120 },
      ]),
    ).toEqual({ trainingMinutes: 2, theoryMinutes: 2 });
  });
});

describe("isStepWithTimer", () => {
  it("returns true for TRAINING and BREAK", () => {
    expect(isStepWithTimer("TRAINING")).toBe(true);
    expect(isStepWithTimer("BREAK")).toBe(true);
  });

  it("returns false for THEORY and null", () => {
    expect(isStepWithTimer("THEORY")).toBe(false);
    expect(isStepWithTimer(null)).toBe(false);
    expect(isStepWithTimer(undefined)).toBe(false);
  });
});

describe("shouldShowEstimatedDuration", () => {
  it("returns true for EXAMINATION, THEORY, PRACTICE", () => {
    expect(shouldShowEstimatedDuration("EXAMINATION")).toBe(true);
    expect(shouldShowEstimatedDuration("THEORY")).toBe(true);
    expect(shouldShowEstimatedDuration("PRACTICE")).toBe(true);
  });

  it("returns false for TRAINING, BREAK, null", () => {
    expect(shouldShowEstimatedDuration("TRAINING")).toBe(false);
    expect(shouldShowEstimatedDuration("BREAK")).toBe(false);
    expect(shouldShowEstimatedDuration(null)).toBe(false);
  });
});

describe("getDayTitle", () => {
  it("returns fixed titles for special types", () => {
    expect(getDayTitle("instructions")).toBe("Инструкции");
    expect(getDayTitle("introduction")).toBe("Вводный блок");
    expect(getDayTitle("diagnostics")).toBe("Диагностика");
    expect(getDayTitle("summary")).toBe("Подведение итогов");
  });

  it("returns День N for default type with displayDayNumber", () => {
    expect(getDayTitle("regular", 3)).toBe("День 3");
  });

  it("returns День for default type without displayDayNumber", () => {
    expect(getDayTitle("regular")).toBe("День");
  });
});

describe("formatTimeLeft", () => {
  it("formats as M:SS", () => {
    expect(formatTimeLeft(0)).toBe("0:00");
    expect(formatTimeLeft(90)).toBe("1:30");
    expect(formatTimeLeft(3661)).toBe("61:01");
  });

  it("clamps negative to 0:00", () => {
    expect(formatTimeLeft(-5)).toBe("0:00");
  });

  it("floors float seconds", () => {
    expect(formatTimeLeft(65.9)).toBe("1:05");
  });
});

describe("statusRank", () => {
  it("returns 2 for COMPLETED", () => {
    expect(statusRank("COMPLETED")).toBe(2);
  });

  it("returns 1 for IN_PROGRESS, PAUSED, RESET", () => {
    expect(statusRank("IN_PROGRESS")).toBe(1);
    expect(statusRank("PAUSED")).toBe(1);
    expect(statusRank("RESET")).toBe(1);
  });

  it("returns 0 for NOT_STARTED and unknown", () => {
    expect(statusRank("NOT_STARTED")).toBe(0);
    expect(statusRank("other")).toBe(0);
  });
});

describe("calculateDayStatus", () => {
  it("returns NOT_STARTED for empty stepStates", () => {
    expect(calculateDayStatus("c1", "d1", {})).toBe(TrainingStatus.NOT_STARTED);
  });

  it("returns IN_PROGRESS when one step in progress", () => {
    const stepStates = { "c1-d1-0": { status: "IN_PROGRESS" } };
    expect(
      calculateDayStatus("c1", "d1", stepStates, 1),
    ).toBe(TrainingStatus.IN_PROGRESS);
  });

  it("returns COMPLETED when all steps completed", () => {
    const stepStates = {
      "c1-d1-0": { status: "COMPLETED" },
      "c1-d1-1": { status: "COMPLETED" },
    };
    expect(
      calculateDayStatus("c1", "d1", stepStates, 2),
    ).toBe(TrainingStatus.COMPLETED);
  });
});

describe("calculateCourseStatus", () => {
  it("returns COMPLETED when all days completed", () => {
    const stepStates = {
      "c1-d1-0": { status: "COMPLETED" },
      "c1-d2-0": { status: "COMPLETED" },
    };
    expect(
      calculateCourseStatus("c1", stepStates, 2, ["d1", "d2"]),
    ).toBe(TrainingStatus.COMPLETED);
  });

  it("returns IN_PROGRESS when mixed", () => {
    const stepStates = {
      "c1-d1-0": { status: "COMPLETED" },
      "c1-d2-0": { status: "IN_PROGRESS" },
    };
    expect(
      calculateCourseStatus("c1", stepStates, 2, ["d1", "d2"]),
    ).toBe(TrainingStatus.IN_PROGRESS);
  });

  it("returns RESET when any day is RESET", () => {
    const stepStates = { "c1-d1-0": { status: "RESET" } };
    expect(calculateCourseStatus("c1", stepStates, 1, ["d1"])).toBe(
      TrainingStatus.RESET,
    );
  });
});

describe("calculateCourseStatusFromDayStatuses", () => {
  it("returns NOT_STARTED for empty array", () => {
    expect(calculateCourseStatusFromDayStatuses([])).toBe(TrainingStatus.NOT_STARTED);
  });

  it("returns COMPLETED when all days completed and count matches", () => {
    expect(
      calculateCourseStatusFromDayStatuses(
        [TrainingStatus.COMPLETED, TrainingStatus.COMPLETED],
        2,
      ),
    ).toBe(TrainingStatus.COMPLETED);
  });

  it("returns IN_PROGRESS when contains IN_PROGRESS", () => {
    expect(
      calculateCourseStatusFromDayStatuses([
        TrainingStatus.COMPLETED,
        TrainingStatus.IN_PROGRESS,
      ]),
    ).toBe(TrainingStatus.IN_PROGRESS);
  });

  it("returns RESET when only RESET", () => {
    expect(
      calculateCourseStatusFromDayStatuses([TrainingStatus.RESET]),
    ).toBe(TrainingStatus.RESET);
  });
});
