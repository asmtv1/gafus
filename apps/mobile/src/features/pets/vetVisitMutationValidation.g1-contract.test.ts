import { describe, it, expect } from "vitest";
import { vetPrecommitRejection, vetFieldErrorMessage } from "./vetVisitMutationValidation";
describe("V45 Hono/Core vet precommit codes", () => {
  it("structured JSON body invalid is safely rejected", () => {
    expect(
      vetPrecommitRejection({
        success: false,
        code: "VET_VISIT_INVALID_JSON",
        details: { fieldErrors: { body: "INVALID_JSON" } },
      }),
    ).toEqual({ body: "INVALID_JSON" });
  });
  it("valid machine-only field code survives and text is generic", () => {
    const fields = vetPrecommitRejection({
      success: false,
      code: "VET_VISIT_VALIDATION_ERROR",
      details: { fieldErrors: { specialty: "REQUIRED", notes: "OUT_OF_RANGE" } },
    });
    expect(fields).toEqual({ specialty: "REQUIRED", notes: "OUT_OF_RANGE" });
    expect(vetFieldErrorMessage(fields!)).toBe("Проверьте специальность врача.");
  });
  it("unstructured 400 and unknown codes/fields/empty data stay ambiguous", () => {
    for (const reply of [
      { success: false, code: "BAD_REQUEST" },
      {
        success: false,
        code: "VET_VISIT_VALIDATION_ERROR",
        details: { fieldErrors: { notes: "PRIVATE" } },
      },
      {
        success: false,
        code: "VET_VISIT_VALIDATION_ERROR",
        details: { fieldErrors: { foreignField: "REQUIRED" } },
      },
      {
        success: false,
        code: "VET_VISIT_INVALID_JSON",
        details: { fieldErrors: { body: "INVALID_VALUE" } },
      },
      { success: false, code: "VET_VISIT_VALIDATION_ERROR", details: { fieldErrors: {} } },
    ])
      expect(vetPrecommitRejection(reply)).toBeNull();
  });
});
