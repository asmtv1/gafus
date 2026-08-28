import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@gafus/mailer", () => ({
  renderNpdReceiptEmail: vi.fn(() => ({ subject: "Чек", text: "text", html: "html" })),
  sendTransactionalMail: vi.fn(),
}));

import { sendTransactionalMail } from "@gafus/mailer";
import { processDueNpdReceiptEmailDeliveries } from "./npd-email-worker";

function db(delivery: any, updateResults = [{ count: 1 }, { count: 1 }]) {
  return { npdReceiptEmailDelivery: {
    findFirst: vi.fn().mockResolvedValueOnce({ id: "delivery-1" }).mockResolvedValueOnce(null),
    updateMany: vi.fn().mockImplementation(() => Promise.resolve(updateResults.shift() ?? { count: 1 })),
    findUnique: vi.fn().mockResolvedValue(delivery),
  } } as any;
}

const receipt = { status: "ISSUED", providerReceiptId: "provider-1", printUrl: "https://example.test/receipt", serviceName: "Подписка Gafus Premium на 30 дней", amountKopecks: 250000, operationAt: new Date() };

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe("processDueNpdReceiptEmailDeliveries", () => {
  it("sends an issued receipt to immutable delivery snapshot and marks SENT", async () => {
    const client = db({ id: "delivery-1", status: "PENDING", attemptCount: 1, leaseOwner: "owner", recipientEmail: "buyer@example.test", receipt });
    await expect(processDueNpdReceiptEmailDeliveries({ db: client, batchSize: 1 })).resolves.toMatchObject({ sent: 1 });
    expect(sendTransactionalMail).toHaveBeenCalledWith(expect.objectContaining({ to: "buyer@example.test" }));
    expect(client.npdReceiptEmailDelivery.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }));
  });

  it("records SMTP failure only on delivery and makes it retryable", async () => {
    vi.mocked(sendTransactionalMail).mockRejectedValueOnce(new Error("smtp down"));
    const client = db({ id: "delivery-1", status: "PENDING", attemptCount: 1, leaseOwner: "owner", recipientEmail: "buyer@example.test", receipt });
    await expect(processDueNpdReceiptEmailDeliveries({ db: client, batchSize: 1 })).resolves.toMatchObject({ failed: 1 });
    expect(client.npdReceiptEmailDelivery.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", lastErrorCode: "SMTP_FAILURE" }) }));
  });

  it("does not send an already SENT row", async () => {
    const client = { npdReceiptEmailDelivery: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    await expect(processDueNpdReceiptEmailDeliveries({ db: client })).resolves.toMatchObject({ processed: 0 });
    expect(sendTransactionalMail).not.toHaveBeenCalled();
  });
});
