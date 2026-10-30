import { describe, expect, it } from "vitest";
import { profitApiUrl, profitSearchFromLocation } from "./profitNavigation";

describe("Next profit dashboard links", () => {
  it("preserves scoped historical period and pagination", () => {
    expect(profitApiUrl("?from=2026-09-01&to=2026-10-20&paymentPage=2&videoPage=3"))
      .toBe("/api/v1/admin/profit?from=2026-09-01&to=2026-10-20&paymentPage=2&videoPage=3");
  });
  it("drops SQL/provider/unknown arguments and invalid accounting periods", () => {
    expect(profitApiUrl("?from=2026-02-30&to=2026-10-20&secret=1&paymentPage=10001"))
      .toBe("/api/v1/admin/profit");
    expect(profitSearchFromLocation("?from=2026-10-20&to=2026-09-01&videoPage=0"))
      .toBe("");
    expect(profitApiUrl("?from=%2Fbad&to=2026-10-22&paymentPage=3&other=1"))
      .toBe("/api/v1/admin/profit?paymentPage=3");
  });
});
