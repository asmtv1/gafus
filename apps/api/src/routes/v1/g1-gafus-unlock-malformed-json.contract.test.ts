/** G1 Gafus /unlock real Hono request/role boundary; Core is mocked, no DB writes. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  completed: vi.fn(),
  unlock: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: fake.verifyAccessToken }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: fake.completed }));
vi.mock("@gafus/core/services/gafus", () => ({
  unlockContentWithGafus: fake.unlock,
  getGafusStatus: vi.fn(),
  listGafusTransactions: vi.fn(),
  listGafusMiniGuides: vi.fn(),
  getGafusPostReactionProgress: vi.fn(),
  getAuthorizedMiniGuideContent: vi.fn(),
  GafusError: class MockGafusError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
import { authMiddleware } from "../../middleware/auth";
import { gafusRoutes } from "./gafus";

const validBody = {
  clientRequestId: "g1-gafus-request-0001",
  target: { type: "COURSE_STEP", dayOnCourseId: "g1-day", stepOnDayId: "g1-step" },
};
function app() {
  const h = new Hono();
  h.use("/api/v1/gafus/*", authMiddleware);
  h.route("/api/v1/gafus", gafusRoutes);
  return h;
}
function post(
  body: string,
  headers: Record<string, string> = { authorization: "Bearer synthetic" },
) {
  return app().request("http://local.test/api/v1/gafus/unlock", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  fake.verifyAccessToken.mockResolvedValue({
    id: "owner-from-token",
    username: "user",
    role: "USER",
  });
  fake.completed.mockResolvedValue(true);
  fake.unlock.mockResolvedValue({ receiptId: "synthetic-receipt", replay: false });
});
describe("G1 Web/Mobile Gafus unlock malformed JSON/auth/RBAC contract", () => {
  it("GU01 malformed JSON -> 400 private envelope, Core never called", async () => {
    const r = await post('{"clientRequestId":');
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({
      success: false,
      error: "Некорректные данные",
      code: "GAFUS_VALIDATION_ERROR",
    });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(fake.unlock).not.toHaveBeenCalled();
  });
  it("GU02 empty body -> 400 before Core", async () => {
    const r = await post("");
    expect(r.status).toBe(400);
    expect(fake.unlock).not.toHaveBeenCalled();
  });
  it("GU03 valid JSON wrong nested target or forged owner -> 400", async () => {
    for (const value of [
      {
        clientRequestId: "g1-gafus-request-0001",
        target: { type: "COURSE_STEP", stepOnDayId: "g1-step" },
      },
      { ...validBody, userId: "forged-other-owner" },
      { ...validBody, target: { ...validBody.target, price: 0 } },
    ]) {
      const r = await post(JSON.stringify(value));
      expect(r.status).toBe(400);
    }
    expect(fake.unlock).not.toHaveBeenCalled();
  });
  it("GU04 unauthenticated rejects before parsing malformed JSON", async () => {
    const r = await post('{"clientRequestId":', {});
    expect(r.status).toBe(401);
    expect(fake.unlock).not.toHaveBeenCalled();
  });
  it("GU05 untrusted browser cookie Origin rejects before decoding malformed JSON", async () => {
    const r = await post('{"clientRequestId":', {
      cookie: "gafus_access=synthetic",
      origin: "https://attacker.invalid",
    });
    expect(r.status).toBe(403);
    expect(fake.verifyAccessToken).not.toHaveBeenCalled();
    expect(fake.unlock).not.toHaveBeenCalled();
  });
  it("GU06 forbidden Core decision stays 403 and private without content", async () => {
    fake.unlock.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const r = await post(JSON.stringify(validBody));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ success: false, code: "GAFUS_FORBIDDEN" });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("GU07 valid JSON always sends authenticated owner and exact validated target", async () => {
    const r = await post(JSON.stringify(validBody));
    expect(r.status).toBe(200);
    expect(fake.unlock).toHaveBeenCalledOnce();
    expect(fake.unlock).toHaveBeenCalledWith({
      userId: "owner-from-token",
      clientRequestId: validBody.clientRequestId,
      target: validBody.target,
    });
  });
  it("ARTICLE target is accepted only with authenticated owner and exact articleId", async () => {
    const target = { type: "ARTICLE", articleId: "paid-article-1" };
    const body = { clientRequestId: "article-gafus-0001", target };
    const result = await post(JSON.stringify(body));
    expect(result.status).toBe(200);
    expect(fake.unlock).toHaveBeenCalledWith({
      userId: "owner-from-token", target,
      clientRequestId: "article-gafus-0001",
    });
    const forged = await post(JSON.stringify({
      ...body, target: { ...target, cost: 0 },
    }));
    expect(forged.status).toBe(400);
    expect(fake.unlock).toHaveBeenCalledOnce();
  });

  it("GU08 internal Core SyntaxError is safe 500, not malformed-client 400", async () => {
    fake.unlock.mockRejectedValueOnce(new SyntaxError("DONT_EXPOSE_CORE_SECRET"));
    const r = await post(JSON.stringify(validBody));
    expect(r.status).toBe(500);
    const json = await r.json();
    expect(json).toMatchObject({ success: false, code: "GAFUS_INTERNAL_ERROR" });
    expect(JSON.stringify(json)).not.toContain("DONT_EXPOSE_CORE_SECRET");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});
