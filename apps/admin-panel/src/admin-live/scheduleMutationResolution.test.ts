import { describe, expect, it } from "vitest";
import { AdminHttpError } from "./api";
import { scheduleMutationNeedsReadback } from "./scheduleMutationResolution";

describe("schedule mutation unknown acknowledgement", () => {
  it("requires authoritative readback after a network error or 503", () => {
    expect(scheduleMutationNeedsReadback(new TypeError("Failed to fetch"))).toBe(true);
    expect(
      scheduleMutationNeedsReadback(
        new AdminHttpError(503, "SCHEDULE_OPERATION_FAILED", "unknown"),
      ),
    ).toBe(true);
    expect(
      scheduleMutationNeedsReadback(new AdminHttpError(200, "INVALID_RESPONSE", "bad ACK")),
    ).toBe(true);
  });
  it("permits correction after a definite validation/auth rejection", () => {
    expect(
      scheduleMutationNeedsReadback(new AdminHttpError(400, "INVALID_DAY_OFF", "bad day")),
    ).toBe(false);
    expect(scheduleMutationNeedsReadback(new AdminHttpError(403, "FORBIDDEN", "denied"))).toBe(
      false,
    );
  });
  it("requires readback for concurrency 409 or unknown request throttling", () => {
    expect(scheduleMutationNeedsReadback(new AdminHttpError(409, "CONFLICT", "changed"))).toBe(
      true,
    );
    expect(
      scheduleMutationNeedsReadback(new AdminHttpError(429, "REQUEST_FAILED", "throttled")),
    ).toBe(true);
  });
});
