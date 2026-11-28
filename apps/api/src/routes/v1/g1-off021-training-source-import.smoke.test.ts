import { it, expect } from "vitest";
it("SQL training composition exposes ordinary training operations", async () => {
  const { sqlTraining: source } = await import("../../modules/training/composition/sql-training-instance");
  console.log("DIRECT_CORE_TRAINING_EXPORT_NAMES", Object.keys(source).sort().join(","));
  expect(typeof source.requireCourseStepOperationAccess).toBe("function");
  expect(typeof source.applyStepAndDayTx).toBe("function");
});
