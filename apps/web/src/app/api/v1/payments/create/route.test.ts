import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("retired individual purchase endpoint", () => {
  it("always returns 410 without creating a charge", async () => {
    const response = POST();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      success: false, code: "LEGACY_PURCHASES_DISABLED",
    });
  });
});
