import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  createPayment,
  confirmPaymentFromWebhook,
  cancelPaymentFromWebhook,
  refundPaymentFromWebhook,
} from "./paymentService";

const mockCourseFindUnique = vi.fn();
const mockCourseAccessFindUnique = vi.fn();
const mockPaymentFindFirst = vi.fn();
const mockPaymentCreate = vi.fn();
const mockPaymentUpdate = vi.fn();
const mockCourseAccessUpsert = vi.fn();
const mockCourseAccessDelete = vi.fn();

const txStub = {
  courseAccess: {
    upsert: (...args: unknown[]) => mockCourseAccessUpsert(...args),
    delete: (...args: unknown[]) => mockCourseAccessDelete(...args),
  },
  payment: {
    update: (...args: unknown[]) => mockPaymentUpdate(...args),
  },
};

const mockTransaction = vi.fn((fn: (tx: typeof txStub) => Promise<unknown>) =>
  fn(txStub),
);

vi.mock("@gafus/prisma", () => ({
  prisma: {
    course: {
      findUnique: (...args: unknown[]) => mockCourseFindUnique(...args),
    },
    courseAccess: {
      findUnique: (...args: unknown[]) => mockCourseAccessFindUnique(...args),
    },
    payment: {
      findFirst: (...args: unknown[]) => mockPaymentFindFirst(...args),
      create: (...args: unknown[]) => mockPaymentCreate(...args),
      update: (...args: unknown[]) => mockPaymentUpdate(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mockTransaction(fn),
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

const baseParams = {
  userId: "user-1",
  courseId: "course-1",
  returnUrl: "https://example.com/return",
  shopId: "shop",
  secretKey: "key",
};

describe("createPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCourseFindUnique.mockResolvedValue({
      id: "course-1",
      type: "fitness",
      isPaid: true,
      priceRub: 1000,
    });
    mockCourseAccessFindUnique.mockResolvedValue(null);
    mockPaymentFindFirst.mockResolvedValue(null);
    mockPaymentCreate.mockResolvedValue({ id: "pay-1" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "yoo-1",
            confirmation: { confirmation_url: "https://yookassa.ru/confirm" },
          }),
      }),
    );
  });

  it("returns error when neither returnUrl nor origin", async () => {
    const result = await createPayment({
      ...baseParams,
      returnUrl: undefined,
      origin: undefined,
    } as Parameters<typeof createPayment>[0]);

    expect(result.success).toBe(false);
    expect(result.error).toContain("returnUrl");
    expect(mockCourseFindUnique).not.toHaveBeenCalled();
  });

  it("returns error when course not found", async () => {
    mockCourseFindUnique.mockResolvedValue(null);

    const result = await createPayment(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain("не найден");
  });

  it("returns error when course not paid", async () => {
    mockCourseFindUnique.mockResolvedValue({
      id: "course-1",
      type: "fitness",
      isPaid: false,
      priceRub: 1000,
    });

    const result = await createPayment(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain("не является платным");
  });

  it("returns error when course has no price", async () => {
    mockCourseFindUnique.mockResolvedValue({
      id: "course-1",
      type: "fitness",
      isPaid: true,
      priceRub: null,
    });

    const result = await createPayment(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain("цена");
  });

  it("returns error when user already has access", async () => {
    mockCourseAccessFindUnique.mockResolvedValue({ id: "access-1" });

    const result = await createPayment(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Доступ");
  });

  it("returns existing pending payment when available", async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: "existing-pay",
      confirmationUrl: "https://yookassa.ru/existing",
    });

    const result = await createPayment(baseParams);

    expect(result.success).toBe(true);
    expect(result.paymentId).toBe("existing-pay");
    expect(result.confirmationUrl).toBe("https://yookassa.ru/existing");
    expect(mockPaymentCreate).not.toHaveBeenCalled();
  });

  it("returns error when returnUrl is not https", async () => {
    const result = await createPayment({
      ...baseParams,
      returnUrl: "http://example.com/return",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTPS");
  });

  it("creates payment and returns confirmation URL on success", async () => {
    const result = await createPayment(baseParams);

    expect(result.success).toBe(true);
    expect(result.paymentId).toBe("pay-1");
    expect(result.confirmationUrl).toBe("https://yookassa.ru/confirm");
    expect(mockPaymentCreate).toHaveBeenCalled();
    expect(mockPaymentUpdate).toHaveBeenCalled();
  });
});

describe("confirmPaymentFromWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCourseAccessUpsert.mockResolvedValue({});
    mockPaymentUpdate.mockResolvedValue({});
  });

  it("returns early when payment not found", async () => {
    mockPaymentFindFirst.mockResolvedValue(null);

    await confirmPaymentFromWebhook("yoo-nonexistent");

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns early on amount mismatch", async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: "p1",
      userId: "u1",
      courseId: "c1",
      amountRub: 1000,
    });

    await confirmPaymentFromWebhook("yoo-1", "500.00");

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("grants access and updates status when payment found", async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: "p1",
      userId: "u1",
      courseId: "c1",
      amountRub: 1000,
    });

    await confirmPaymentFromWebhook("yoo-1", "1000.00");

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockCourseAccessUpsert).toHaveBeenCalled();
    expect(mockPaymentUpdate).toHaveBeenCalled();
  });
});

describe("cancelPaymentFromWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPaymentUpdate.mockResolvedValue({});
  });

  it("returns early when payment not found", async () => {
    mockPaymentFindFirst.mockResolvedValue(null);

    await cancelPaymentFromWebhook("yoo-nonexistent");

    expect(mockPaymentUpdate).not.toHaveBeenCalled();
  });

  it("updates status to CANCELED when payment found", async () => {
    mockPaymentFindFirst.mockResolvedValue({ id: "p1" });

    await cancelPaymentFromWebhook("yoo-1");

    expect(mockPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: { status: "CANCELED" },
      }),
    );
  });
});

describe("refundPaymentFromWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCourseAccessDelete.mockResolvedValue({});
    mockPaymentUpdate.mockResolvedValue({});
  });

  it("returns early when payment not found", async () => {
    mockPaymentFindFirst.mockResolvedValue(null);

    await refundPaymentFromWebhook("yoo-nonexistent");

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("deletes access and updates status when payment found", async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: "p1",
      userId: "u1",
      courseId: "c1",
    });

    await refundPaymentFromWebhook("yoo-1");

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockCourseAccessDelete).toHaveBeenCalled();
    expect(mockPaymentUpdate).toHaveBeenCalled();
  });
});
