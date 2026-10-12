import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createArticlePaymentMock,
  createPaymentMock,
  getCourseByIdOrTypeMock,
  prismaArticleFindUniqueMock,
  prismaCourseFindUniqueMock,
  verifyAppleCoursePurchaseMock,
} = vi.hoisted(() => ({
  createArticlePaymentMock: vi.fn(),
  createPaymentMock: vi.fn(),
  getCourseByIdOrTypeMock: vi.fn(),
  prismaArticleFindUniqueMock: vi.fn(),
  prismaCourseFindUniqueMock: vi.fn(),
  verifyAppleCoursePurchaseMock: vi.fn(),
}));

vi.mock("@gafus/core/services/payments", () => ({
  createArticlePayment: createArticlePaymentMock,
  createPayment: createPaymentMock,
  verifyAppleCoursePurchase: verifyAppleCoursePurchaseMock,
  getArticlePaymentTarget: prismaArticleFindUniqueMock,
  getAppleCoursePaymentMetadata: prismaCourseFindUniqueMock,
}));

vi.mock("@gafus/core/services/course", () => ({
  getCourseByIdOrType: getCourseByIdOrTypeMock,
}));

// The middleware only needs registration completion; avoid pulling the full
// auth service graph into a payments route contract test.
vi.mock("@gafus/core/services/auth", () => ({
  isRegistrationCompleted: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    article: { findUnique: prismaArticleFindUniqueMock },
    course: { findUnique: prismaCourseFindUniqueMock },
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { authMiddleware } from "../../middleware/auth";
import { jsonRequest } from "../../test/route-test-utils";
import { paymentsRoutes } from "./payments";

function createTestApp() {
  const app = new Hono();
  app.use("/api/v1/payments/*", authMiddleware);
  app.route("/api/v1/payments", paymentsRoutes);
  return app;
}

function createAuthenticatedTestApp() {
  const app = new Hono();
  app.use("/api/v1/payments/*", async (c, next) => {
    c.set("user", { id: "user-1", username: "student", role: "USER" });
    await next();
  });
  app.route("/api/v1/payments", paymentsRoutes);
  return app;
}

describe("payments route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEB_APP_URL = "https://gafus.test";
    process.env.YOOKASSA_SHOP_ID = "shop-id";
    process.env.YOOKASSA_SECRET_KEY = "secret-key";
  });

  it("requires auth before creating a payment", async () => {
    const app = createTestApp();

    const response = await app.request(
      jsonRequest("/api/v1/payments/create", "POST", {
        courseId: "course-1",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Токен не предоставлен",
    });
  });

  it("rejects payment creation when target entity is ambiguous", async () => {
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      jsonRequest("/api/v1/payments/create", "POST", {
        courseId: "course-1",
        articleId: "article-1",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("disables legacy payment creation before loading YooKassa credentials", async () => {
    delete process.env.YOOKASSA_SECRET_KEY;
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      jsonRequest("/api/v1/payments/create", "POST", {
        courseType: "obedience",
      }),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Разовые покупки больше недоступны. Оформите Premium-подписку.",
      code: "LEGACY_PURCHASES_DISABLED",
    });
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it("disables legacy iOS course payments", async () => {
    const app = createAuthenticatedTestApp();
    getCourseByIdOrTypeMock.mockResolvedValueOnce({ id: "course-1", type: "obedience" });

    const response = await app.request(
      jsonRequest(
        "/api/v1/payments/create",
        "POST",
        { courseType: "obedience" },
        { "x-client-platform": "ios" },
      ),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "LEGACY_PURCHASES_DISABLED",
    });
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it("does not create a legacy course payment", async () => {
    const app = createAuthenticatedTestApp();
    getCourseByIdOrTypeMock.mockResolvedValueOnce({ id: "course-1", type: "obedience" });
    createPaymentMock.mockResolvedValueOnce({
      success: true,
      paymentId: "payment-1",
      confirmationUrl: "https://pay.test/confirm",
    });

    const response = await app.request(
      jsonRequest(
        "/api/v1/payments/create",
        "POST",
        { courseType: "obedience" },
        {
          "user-agent": "GafusApp/1.0",
          "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        },
      ),
    );

    expect(response.status).toBe(410);
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it("disables legacy Apple course verification", async () => {
    const app = createAuthenticatedTestApp();
    verifyAppleCoursePurchaseMock.mockResolvedValueOnce({
      success: false,
      error: "Транзакция уже использована",
      code: "APPLE_TRANSACTION_CONFLICT",
    });

    const response = await app.request(
      jsonRequest("/api/v1/payments/apple/verify", "POST", {
        signedTransactionInfo: "signed-token",
      }),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Разовые покупки больше недоступны. Оформите Premium-подписку.",
      code: "LEGACY_PURCHASES_DISABLED",
    });
  });

  it("returns Apple course metadata without private caching", async () => {
    const app = createAuthenticatedTestApp();
    getCourseByIdOrTypeMock.mockResolvedValueOnce({ id: "course-1", type: "obedience" });
    prismaCourseFindUniqueMock.mockResolvedValueOnce({
      appleIapProductId: "gafus.course.obedience",
      isPaid: true,
    });

    const response = await app.request(
      jsonRequest("/api/v1/payments/apple/course-metadata?courseType=obedience", "GET"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        courseId: "course-1",
        appleIapProductId: "gafus.course.obedience",
        isPaid: true,
      },
    });
  });
});
