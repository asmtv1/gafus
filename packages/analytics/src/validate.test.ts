import { describe, expect, it } from "vitest";

import { MAX_ANALYTICS_PROPS_BYTES } from "./constants";
import { buildGafusProperties, isCanonicalEventName, safeParseTrackPayload } from "./validate";

describe("validate analytics", () => {
  it("отклоняет неизвестное eventName", () => {
    expect(isCanonicalEventName("unknown" as never)).toBe(false);
    const r = safeParseTrackPayload({
      eventName: "unknown",
      pathOrScreen: "/",
      platform: "web",
      sessionId: "s",
      ts: new Date().toISOString(),
    });
    expect(r.ok).toBe(false);
  });

  it("принимает page_view", () => {
    const r = safeParseTrackPayload({
      eventName: "page_view",
      pathOrScreen: "/courses",
      platform: "web",
      sessionId: "s",
      ts: new Date().toISOString(),
    });
    expect(r.ok).toBe(true);
  });

  it("при превышении лимита возвращает truncated (F6)", () => {
    const big = "x".repeat(MAX_ANALYTICS_PROPS_BYTES + 100);
    const r = safeParseTrackPayload({
      eventName: "button_click",
      pathOrScreen: "/",
      platform: "web",
      sessionId: "s",
      ts: new Date().toISOString(),
      elementId: big,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const g = buildGafusProperties(r.value);
      expect(g).toEqual({ truncated: true });
    }
  });
});
