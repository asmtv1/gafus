/** AG1-003: Expo development CORS origins are exact hosts, never prefix matches. */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { ALLOWED_BROWSER_ORIGINS, corsMiddleware } from "./cors";

function testApp() {
  const app = new Hono();
  app.use("*", corsMiddleware);
  app.get("/api/v1/private", (c) => c.json({ ok: true }));
  return app;
}

describe("AG1-003 credentialed Expo CORS exact hostname boundary", () => {
  it.each([
    "https://gafus.ru",
    "https://adminka.gafus.ru",
    "https://trainer-panel.gafus.ru",
    "http://localhost:3000",
    "https://dev.exp.direct",
    "https://nested.dev.exp.direct",
    "http://dev.exp.direct:8081",
  ])("reflects allowed origin exactly %s", async (origin) => {
    const result = await testApp().request("/api/v1/private", {
      headers: { Origin: origin },
    });
    expect(result.status).toBe(200);
    expect(result.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(result.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it.each([
    "https://dev.exp.direct.attacker.example",
    "https://dev.exp.direct@attacker.example",
    "https://dev.exp.direct:443@attacker.example",
    "https://dev.exp.direct/unsafe",
    "https://dev.exp.direct?redirect=attacker.example",
    "https://exp.direct.evil.example",
    "https://evil-gafus.ru",
    "https://adminka.gafus.ru.attacker.example",
    "https://trainer-panel.gafus.ru.attacker.example",
    "https://admin.gafus.ru",
    "https://trainer.gafus.ru",
    "http://gafus.ru",
    "https://localhost:3000",
  ])("never grants credentialed CORS to spoofed origin %s", async (origin) => {
    const result = await testApp().request("/api/v1/private", {
      headers: { Origin: origin },
    });
    expect(result.status).toBe(200);
    expect(result.headers.get("Access-Control-Allow-Origin")).not.toBe(origin);
    // Hono may set Allow-Credentials even for a denied Origin. Browsers also
    // require a matching Allow-Origin; reflection is the security boundary.
  });

  it("does not trust an Expo origin for sensitive browser-cookie mutations", () => {
    expect(ALLOWED_BROWSER_ORIGINS.has("https://dev.exp.direct")).toBe(false);
    expect(ALLOWED_BROWSER_ORIGINS.has("https://gafus.ru")).toBe(true);
    expect(ALLOWED_BROWSER_ORIGINS.has("https://adminka.gafus.ru")).toBe(true);
    expect(ALLOWED_BROWSER_ORIGINS.has("https://trainer-panel.gafus.ru")).toBe(true);
    expect(ALLOWED_BROWSER_ORIGINS.has("https://admin.gafus.ru")).toBe(false);
    expect(ALLOWED_BROWSER_ORIGINS.has("https://trainer.gafus.ru")).toBe(false);
    expect(ALLOWED_BROWSER_ORIGINS.has("http://localhost:3000")).toBe(false);
  });

  it("validates an exact allowed preflight while refusing origin spoofing", async () => {
    const valid = await testApp().request("/api/v1/private", {
      method: "OPTIONS",
      headers: {
        Origin: "https://dev.exp.direct",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(valid.headers.get("Access-Control-Allow-Origin")).toBe("https://dev.exp.direct");
    const forged = await testApp().request("/api/v1/private", {
      method: "OPTIONS",
      headers: {
        Origin: "https://dev.exp.direct.attacker.example",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(forged.headers.get("Access-Control-Allow-Origin")).not.toBe(
      "https://dev.exp.direct.attacker.example",
    );
  });

  it("maintains cache key separation when reflecting different allowed origins", async () => {
    const app = testApp();
    const first = await app.request("/api/v1/private", {
      headers: { Origin: "https://gafus.ru" },
    });
    const second = await app.request("/api/v1/private", {
      headers: { Origin: "https://dev.exp.direct" },
    });
    expect(first.headers.get("Access-Control-Allow-Origin")).toBe("https://gafus.ru");
    expect(second.headers.get("Access-Control-Allow-Origin")).toBe("https://dev.exp.direct");
    expect(first.headers.get("Vary")?.toLowerCase()).toContain("origin");
    expect(second.headers.get("Vary")?.toLowerCase()).toContain("origin");
  });

});
