import { describe, expect, it } from "vitest";

import { TrainingStatus } from "@gafus/types";

import { getStepDisplayStatus, getDayDisplayStatus } from "./training";

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
