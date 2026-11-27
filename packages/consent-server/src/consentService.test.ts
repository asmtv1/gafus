import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Prisma } from "@gafus/prisma";

const { updateMany, create } = vi.hoisted(() => ({ updateMany: vi.fn(), create: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  ConsentLogStatus: { COMPLETED: "COMPLETED", PENDING: "PENDING", FAILED: "FAILED" },
  ConsentType: {
    PERSONAL_DATA: "PERSONAL_DATA",
    PRIVACY_POLICY: "PRIVACY_POLICY",
    DATA_DISTRIBUTION: "DATA_DISTRIBUTION",
  },
  prisma: {},
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));
import { createCompletedConsentLogsInTransaction } from "./consentService";

const tx = { consentLog: { updateMany, create } } as unknown as Prisma.TransactionClient;
const baseParams = {
  tempSessionId: "sess-1",
  userId: "user-1",
  consentPayload: {
    acceptPersonalData: true,
    acceptPrivacyPolicy: false,
    acceptDataDistribution: false,
  },
  formData: { name: "Synthetic" },
  defaultVersion: "v1",
};

describe("registration consent receipts in the caller transaction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    updateMany.mockResolvedValue({ count: 0 });
    create.mockResolvedValue({});
  });

  it("writes only accepted consent and binds it to the registered owner", async () => {
    await createCompletedConsentLogsInTransaction(tx, baseParams);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tempSessionId: "sess-1",
        consentType: "PERSONAL_DATA",
        status: { not: "COMPLETED" },
        OR: [{ userId: null }, { userId: "user-1" }],
      },
      data: expect.objectContaining({ userId: "user-1", status: "COMPLETED" }),
    }));
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", status: "COMPLETED" }),
    });
  });

  it("writes all three accepted documents", async () => {
    await createCompletedConsentLogsInTransaction(tx, {
      ...baseParams,
      consentPayload: { acceptPersonalData: true, acceptPrivacyPolicy: true, acceptDataDistribution: true },
    });
    expect(updateMany).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("completes a matching historical receipt without creating another", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await createCompletedConsentLogsInTransaction(tx, baseParams);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects unowned completion before issuing writes", async () => {
    await expect(createCompletedConsentLogsInTransaction(tx, { ...baseParams, userId: undefined }))
      .rejects.toThrow("CONSENT_OWNER_REQUIRED");
    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("propagates conflicts and persistence errors to roll back registration", async () => {
    create.mockRejectedValueOnce(new Error("receipt already exists"));
    await expect(createCompletedConsentLogsInTransaction(tx, baseParams)).rejects.toThrow("receipt already exists");
  });
});
