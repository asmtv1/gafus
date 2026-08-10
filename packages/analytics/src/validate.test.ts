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

  it("принимает rewarded access payload и отклоняет лишний provider payload", () => {
    const valid = safeParseTrackPayload({
      eventName: "rewarded_access_granted",
      pathOrScreen: "/articles/paid",
      platform: "web",
      sessionId: "s",
      ts: new Date().toISOString(),
      targetType: "ARTICLE",
      targetId: "article-1",
      expiresAt: "2026-08-12T12:00:00.000Z",
      provider: "YANDEX",
    });
    expect(valid.ok).toBe(true);

    const withRawPayload = safeParseTrackPayload({
      eventName: "rewarded_access_granted",
      pathOrScreen: "/articles/paid",
      platform: "web",
      sessionId: "s",
      ts: new Date().toISOString(),
      targetType: "ARTICLE",
      targetId: "article-1",
      providerPayload: { raw: true },
    });
    expect(withRawPayload.ok).toBe(false);
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
