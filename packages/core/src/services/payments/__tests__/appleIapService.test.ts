import { describe, expect, it, beforeEach, vi } from "vitest";

import type { verifyAndGrantAppleIap as VerifyAndGrantAppleIapFn } from "../appleIapService";

const { mockVerify } = vi.hoisted(() => ({ mockVerify: vi.fn() }));

vi.mock("@apple/app-store-server-library", () => {
  class SignedDataVerifier {
    async verifyAndDecodeTransaction(jws: string) {
      return mockVerify(jws);
    }
  }
  return {
    Environment: {
      SANDBOX: "Sandbox",
      PRODUCTION: "Production",
      XCODE: "Xcode",
      LOCAL_TESTING: "LocalTesting",
    },
    VerificationException: class VerificationException extends Error {
      status = 1;
      constructor(_status?: number, cause?: Error) {
        super("verify failed");
        if (cause) {
          this.cause = cause;
        }
      }
    },
    SignedDataVerifier,
  };
});

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => Buffer.from([0, 1, 2, 3])),
}));

const mockAppleIapFindUnique = vi.fn();
const mockCourseFindUnique = vi.fn();
const mockArticleFindUnique = vi.fn();
const mockAppleIapCreate = vi.fn();
const mockCourseAccessUpsert = vi.fn();
const mockArticleAccessUpsert = vi.fn();
const mockTransaction = vi.fn();

const txStub = {
  appleIapTransaction: {
    create: (...args: unknown[]) => mockAppleIapCreate(...args),
  },
  courseAccess: {
    upsert: (...args: unknown[]) => mockCourseAccessUpsert(...args),
  },
  articleAccess: {
    upsert: (...args: unknown[]) => mockArticleAccessUpsert(...args),
  },
};

mockTransaction.mockImplementation((fn: (tx: typeof txStub) => Promise<unknown>) => fn(txStub));

const mockIsP2002 = vi.fn(() => false);

vi.mock("@gafus/prisma", () => ({
  prisma: {
    course: { findUnique: (...args: unknown[]) => mockCourseFindUnique(...args) },
    article: { findUnique: (...args: unknown[]) => mockArticleFindUnique(...args) },
    appleIapTransaction: {
      findUnique: (...args: unknown[]) => mockAppleIapFindUnique(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
  isPrismaUniqueConstraintError: (...args: unknown[]) => mockIsP2002(...args),
}));

vi.mock("../oferta/ofertaAcceptanceService", () => ({
  recordOfertaAcceptance: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("verifyAndGrantAppleIap", () => {
  let verifyAndGrantAppleIap: typeof VerifyAndGrantAppleIapFn;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsP2002.mockReturnValue(false);
    mockTransaction.mockImplementation((fn: (tx: typeof txStub) => Promise<unknown>) => fn(txStub));

    process.env.APPLE_BUNDLE_ID = "ru.gafus.app";
    process.env.APPLE_ENVIRONMENT = "SANDBOX";
    delete process.env.APPLE_APP_APPLE_ID;
    process.env.APPLE_IAP_PRODUCT_MAP_JSON = JSON.stringify([
      { productId: "ru.test.course", courseId: "c1" },
      { productId: "ru.test.article", articleId: "a1" },
    ]);

    mockVerify.mockResolvedValue({
      bundleId: "ru.gafus.app",
      productId: "ru.test.course",
      originalTransactionId: "ot-1",
      transactionId: "t-1",
      environment: "Sandbox",
    });
    mockAppleIapFindUnique.mockResolvedValue(null);
    mockCourseFindUnique.mockResolvedValue({ id: "c1", isPaid: true });
    mockArticleFindUnique.mockResolvedValue({ id: "a1", visibility: "PAID" });
    mockAppleIapCreate.mockResolvedValue({ id: "ledger-1" });

    vi.resetModules();
    ({ verifyAndGrantAppleIap } = await import("../appleIapService"));
  });

  it("успех: курс, леджер и upsert доступа", async () => {
    const r = await verifyAndGrantAppleIap({
      userId: "u1",
      transactionJws: "fake.jws",
    });
    expect(r).toEqual({ success: true, alreadyGranted: false });
    expect(mockAppleIapCreate).toHaveBeenCalled();
    expect(mockCourseAccessUpsert).toHaveBeenCalled();
  });

  it("успех: статья", async () => {
    mockVerify.mockResolvedValue({
      bundleId: "ru.gafus.app",
      productId: "ru.test.article",
      originalTransactionId: "ot-2",
      transactionId: "t-2",
      environment: "Sandbox",
    });
    const r = await verifyAndGrantAppleIap({
      userId: "u1",
      transactionJws: "fake.jws",
    });
    expect(r).toEqual({ success: true, alreadyGranted: false });
    expect(mockArticleAccessUpsert).toHaveBeenCalled();
    expect(mockCourseAccessUpsert).not.toHaveBeenCalled();
  });

  it("идемпотентность: тот же пользователь и originalTransactionId", async () => {
    mockAppleIapFindUnique.mockResolvedValue({ id: "x", userId: "u1" });
    const r = await verifyAndGrantAppleIap({
      userId: "u1",
      transactionJws: "fake.jws",
    });
    expect(r).toEqual({ success: true, alreadyGranted: true });
    expect(mockAppleIapCreate).not.toHaveBeenCalled();
  });

  it("P2002: считаем уже выданным для того же пользователя", async () => {
    mockIsP2002.mockReturnValue(true);
    mockAppleIapFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: "u1" });
    const p2002 = Object.assign(new Error("Unique constraint"), { code: "P2002" });
    mockTransaction.mockRejectedValueOnce(p2002);
    const r = await verifyAndGrantAppleIap({
      userId: "u1",
      transactionJws: "fake.jws",
    });
    expect(r).toEqual({ success: true, alreadyGranted: true });
  });

  it("JWS_INVALID при несовпадении bundleId в payload", async () => {
    mockVerify.mockResolvedValue({
      bundleId: "other.app",
      productId: "ru.test.course",
      originalTransactionId: "ot-1",
      transactionId: "t-1",
      environment: "Sandbox",
    });
    const r = await verifyAndGrantAppleIap({
      userId: "u1",
      transactionJws: "fake.jws",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.code).toBe("JWS_INVALID");
    }
  });

  it("UNKNOWN_PRODUCT", async () => {
    mockVerify.mockResolvedValue({
      bundleId: "ru.gafus.app",
      productId: "unknown.sku",
      originalTransactionId: "ot-1",
      transactionId: "t-1",
      environment: "Sandbox",
    });
    const r = await verifyAndGrantAppleIap({
      userId: "u1",
      transactionJws: "fake.jws",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.code).toBe("UNKNOWN_PRODUCT");
    }
  });

  it("IAP_ALREADY_LINKED при другом userId", async () => {
    mockAppleIapFindUnique.mockImplementation(async () => ({
      id: "x",
      userId: "u-other",
    }));
    const r = await verifyAndGrantAppleIap({
      userId: "u1",
      transactionJws: "fake.jws",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.code).toBe("IAP_ALREADY_LINKED");
    }
  });

  it("CONFIG_APPLE_IAP без APPLE_BUNDLE_ID", async () => {
    delete process.env.APPLE_BUNDLE_ID;
    vi.resetModules();
    ({ verifyAndGrantAppleIap } = await import("../appleIapService"));
    const r = await verifyAndGrantAppleIap({
      userId: "u1",
      transactionJws: "fake.jws",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.code).toBe("CONFIG_APPLE_IAP");
    }
  });

  it("NOT_FOUND если курс не платный", async () => {
    mockCourseFindUnique.mockResolvedValue({ id: "c1", isPaid: false });
    const r = await verifyAndGrantAppleIap({
      userId: "u1",
      transactionJws: "fake.jws",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.code).toBe("NOT_FOUND");
    }
  });
});
