import { describe, expect, it } from "vitest";

import * as utils from "./index";

describe("utils barrel exports", () => {
  it("exports formatDate from date", () => {
    expect(typeof utils.formatDate).toBe("function");
  });

  it("exports declOfNum from pluralize", () => {
    expect(typeof utils.declOfNum).toBe("function");
  });

  it("exports getAge and getAgeWithMonths from age", () => {
    expect(typeof utils.getAge).toBe("function");
    expect(typeof utils.getAgeWithMonths).toBe("function");
  });

  it("exports getPetTypeLabel from pet", () => {
    expect(typeof utils.getPetTypeLabel).toBe("function");
  });

  it("exports getEmbeddedVideoInfo from video", () => {
    expect(typeof utils.getEmbeddedVideoInfo).toBe("function");
  });

  it("exports social utilities", () => {
    expect(typeof utils.normalizeTelegramInput).toBe("function");
    expect(typeof utils.normalizeInstagramInput).toBe("function");
    expect(typeof utils.normalizeWebsiteUrl).toBe("function");
    expect(typeof utils.getTelegramUrl).toBe("function");
    expect(typeof utils.getInstagramUrl).toBe("function");
  });

  it("exports training utilities", () => {
    expect(typeof utils.getDayKey).toBe("function");
    expect(typeof utils.getStepKey).toBe("function");
    expect(typeof utils.getStepDisplayStatus).toBe("function");
    expect(typeof utils.getDayDisplayStatus).toBe("function");
    expect(typeof utils.calculateDayStatus).toBe("function");
    expect(typeof utils.calculateCourseStatus).toBe("function");
  });

  it("exports retry utilities", () => {
    expect(typeof utils.retryWithBackoff).toBe("function");
    expect(typeof utils.retryServerAction).toBe("function");
  });

  it("exports personalization utilities", () => {
    expect(typeof utils.declineRussianName).toBe("function");
    expect(typeof utils.replacePersonalizationPlaceholders).toBe("function");
  });
});
