/** Exact disposable PG acceptance for verified Apple JWS state writes.
 * Runs only via scripts/qa/payment-archqa-isolated-pg.sh; no Apple network.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { persistVerifiedAppleServerState, type VerifiedAppleServerState } from "./appleSubscriptionState";

const safe = (() => {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return process.env.GAFUS_ARCHQA_REALPG === "1" &&
      /^archqa_schema_[a-f0-9]{12}$/.test(url.pathname.slice(1)) &&
      url.pathname.slice(1) === process.env.GAFUS_ARCHQA_DB_NAME &&
      url.hostname === "127.0.0.1" && url.username === "qapayment" && Number(url.port) > 10000;
  } catch { return false; }
})();
const suite = safe ? describe : describe.skip;
let userId = "", subscriptionId = "";
const originalTransactionId = "qa-apple-original-" + randomUUID();
const start = new Date("2026-11-01T00:00:00.000Z");
const end = new Date("2026-12-01T00:00:00.000Z");
const state = (transactionId: string, from: Date, until: Date, status: VerifiedAppleServerState["status"]): VerifiedAppleServerState => ({
  subscription: { id: subscriptionId, userId },
  originalTransactionId,
  transactionId,
  productId: "gafus.premium.monthly.test",
  status,
  planCode: "MONTHLY",
  paymentStatus: status === "ACTIVE" ? "SUCCEEDED" : status === "REVOKED" ? "REFUNDED" : "CANCELED",
  periodStart: from,
  periodEnd: until,
  priceMilliunits: 249000,
  currency: "RUB",
  transaction: { storefront: "RUS", environment: "Sandbox", webOrderLineItemId: "111" },
  renewal: { autoRenewStatus: status === "ACTIVE" ? 1 : 0 },
  appleStatus: null,
});
const subscription = async () => prisma.appSubscription.findUniqueOrThrow({where:{id:subscriptionId}});
const receipts = async () => ({
  payments: await prisma.appSubscriptionPayment.findMany({where:{subscriptionId}}),
  events: await prisma.appSubscriptionEvent.findMany({where:{subscriptionId}}),
});
suite("verified Apple server state is one serialized subscription transition", () => {
  beforeAll(async () => {
    const [db] = await prisma.$queryRaw<{db:string}[]>`SELECT current_database() AS db`;
    expect(db.db).toBe(process.env.GAFUS_ARCHQA_DB_NAME);
    userId = (await prisma.user.create({data:{username:"qaapple-"+randomUUID(),password:"disposable"}})).id;
    subscriptionId = (await prisma.appSubscription.create({data:{
      userId, provider:"APPLE", planCode:"MONTHLY", status:"PENDING",
      appleOriginalTransactionId: originalTransactionId,
    }})).id;
  });
  afterAll(async () => {
    if(userId) await prisma.user.delete({where:{id:userId}});
    await prisma.$disconnect();
  });
  it("concurrent verified callbacks for one transaction commit exactly one payment and event", async () => {
    const first = state("qa-apple-a",start,end,"ACTIVE");
    await Promise.all([persistVerifiedAppleServerState(first),persistVerifiedAppleServerState(first)]);
    expect(await subscription()).toMatchObject({status:"ACTIVE",currentPeriodEnd:end});
    const { payments, events } = await receipts();
    expect(payments).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(Number(payments[0].amount)).toBe(249);
    expect(payments[0].idempotenceKey).toBe("apple:qa-apple-a");
  });
  it("older revoked notification does not override a later successful period", async () => {
    const secondStart = new Date("2026-12-01T00:00:00Z");
    const secondEnd = new Date("2027-01-01T00:00:00Z");
    await persistVerifiedAppleServerState(state("qa-apple-b",secondStart,secondEnd,"ACTIVE"));
    await persistVerifiedAppleServerState(state("qa-apple-a",start,end,"REVOKED"));
    expect(await subscription()).toMatchObject({status:"ACTIVE",currentPeriodEnd:secondEnd});
    const {payments,events} = await receipts();
    expect(payments).toHaveLength(2);
    expect(events).toHaveLength(2);
  });
  it("current-period revocation wins and a late ACTIVE replay cannot regrant it", async () => {
    const secondStart = new Date("2026-12-01T00:00:00Z");
    const secondEnd = new Date("2027-01-01T00:00:00Z");
    await persistVerifiedAppleServerState(state("qa-apple-b",secondStart,secondEnd,"REVOKED"));
    expect((await subscription()).status).toBe("REVOKED");
    await persistVerifiedAppleServerState(state("qa-apple-b",secondStart,secondEnd,"ACTIVE"));
    expect((await subscription()).status).toBe("REVOKED");
    const {payments,events} = await receipts();
    expect(payments).toHaveLength(2);
    expect(events).toHaveLength(2);
  });
  it("an independently purchased newer period may restore ACTIVE", async () => {
    const thirdStart = new Date("2027-01-01T00:00:00Z");
    const thirdEnd = new Date("2027-02-01T00:00:00Z");
    await persistVerifiedAppleServerState(state("qa-apple-c",thirdStart,thirdEnd,"ACTIVE"));
    expect(await subscription()).toMatchObject({status:"ACTIVE",currentPeriodEnd:thirdEnd});
    expect((await receipts()).payments).toHaveLength(3);
  });
});
