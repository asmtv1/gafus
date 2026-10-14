import { describe, expect, it } from "vitest";

import { MOBILE_ONBOARDING_TOUR_VERSION, getMobileOnboardingTourSteps } from "../tour-steps";

describe("mobile onboarding tour steps", () => {
  it("defines the v1 tour in the required order", () => {
    const steps = getMobileOnboardingTourSteps({ hasPets: true });

    expect(MOBILE_ONBOARDING_TOUR_VERSION).toBe("v1");
    expect(steps.map((step) => step.id)).toEqual([
      "start",
      "consultations",
      "pets",
      "add-pet",
      "prevention",
      "documents",
      "daily-course",
      "courses",
      "finish",
    ]);
    expect(steps.find((step) => step.id === "consultations")?.route).toBe(
      "/(main)/(tabs)/consultations",
    );
    expect(steps.find((step) => step.id === "daily-course")?.targetId).toBe("daily-course-card");
    expect(steps.find((step) => step.id === "pets")).toMatchObject({
      route: "/(main)/(tabs)/more",
      targetId: "menu-pets",
    });
    expect(steps.find((step) => step.id === "add-pet")?.secondaryTargetId).toBe("tab-more");
  });

  it("uses add pet as fallback for pet-only sections when user has no pets", () => {
    const steps = getMobileOnboardingTourSteps({ hasPets: false });

    expect(steps.find((step) => step.id === "prevention")?.targetId).toBe("pets-add-button");
    expect(steps.find((step) => step.id === "documents")?.targetId).toBe("pets-add-button");
  });

  it("makes add pet a required creation step", () => {
    const steps = getMobileOnboardingTourSteps({ hasPets: false });
    const addPetStep = steps.find((step) => step.id === "add-pet");

    expect(addPetStep?.requiresPetCreation).toBe(true);
    expect(addPetStep?.primaryActionLabel).toBe("Добавить питомца");
    expect(addPetStep?.allowSkip).toBe(false);
  });
});
