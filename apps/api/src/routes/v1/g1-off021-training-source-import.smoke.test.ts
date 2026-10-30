import { it, expect } from "vitest";
it("standalone ordinary Core trainingService exports", async () => {
  const source = await import("../../../../../packages/core/src/services/training/trainingService");
  console.log("DIRECT_CORE_TRAINING_EXPORT_NAMES", Object.keys(source).sort().join(","));
  expect(typeof source.requireCourseStepOperationAccess).toBe("function");
  expect(typeof source.applyStepAndDayTx).toBe("function");
});
