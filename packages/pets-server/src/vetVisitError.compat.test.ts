import { describe, expect, it } from "vitest";
import { VetVisitDetailNotFoundError as legacyError } from "./vet-visit-detail.js";
import { VetVisitDetailNotFoundError as sharedError } from "@gafus/pets-shared/vet-visit-error";

describe("private veterinary error identity shared with Core", () => {
  it("preserves one class identity and the same sanitized 404 contract", () => {
    expect(legacyError).toBe(sharedError);
    expect(new legacyError()).toMatchObject({
      status: 404,
      code: "VET_VISIT_NOT_FOUND",
    });
    expect(JSON.stringify(new legacyError())).not.toContain("owner");
  });
});
