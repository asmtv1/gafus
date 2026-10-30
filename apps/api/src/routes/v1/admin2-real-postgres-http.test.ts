import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { adminUsersRoutes } from "./admin-users";
import { adminPartnerRoutes } from "./admin-partners";
import { adminProfitRoutes } from "./admin-profit";
import { gafusAdminRoutes } from "./gafus-admin";
import { adminGafusOperationsRoutes } from "./admin-gafus-operations";

const database = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const enabled = process.env.ADMIN2_REAL_PG === "1" && database?.hostname === "127.0.0.1" &&
  database?.pathname === "/gafus_profit_qa_admin2_20261025_ci" &&
  process.env.JWT_SECRET?.startsWith("admin2-isolated-local-only-");

type Actor = "admin" | "moderator" | "user";
const authTokens: Partial<Record<Actor, string>> = {};
const ids: Partial<Record<Actor | "buyer" | "partner", string>> = {};
const qaId = `admin2-${randomUUID()}`;
const app = new Hono();
app.use("/api/v1/*", authMiddleware);
app.route("/api/v1/admin/users", adminUsersRoutes);
app.route("/api/v1/admin/partners", adminPartnerRoutes);
app.route("/api/v1/admin/profit", adminProfitRoutes);
app.route("/api/v1/gafus/admin", gafusAdminRoutes);
app.route("/api/v1/admin/gafus-operations", adminGafusOperationsRoutes);

function request(path: string, options: {
  actor?: Actor; method?: string; body?: object; token?: string;
} = {}) {
  const token = options.token ?? (options.actor ? authTokens[options.actor] : undefined);
  return app.request(`http://admin2.local${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
}

// Every write uses a new synthetic row and a distinct disposable localhost QA database.
describe.skipIf(!enabled)("ADMIN-2 registered Hono + real JWT + isolated PostgreSQL", () => {
  let partnerId: string;
  let paymentId: string;
  let expenseId: string;
  let signalId: string;
  let adjustmentKey: string;

  beforeAll(async () => {
    const actors = [
      { key: "admin" as const, role: "ADMIN" as const },
      { key: "moderator" as const, role: "MODERATOR" as const },
      { key: "user" as const, role: "USER" as const },
      { key: "partner" as const, role: "PARTNER" as const },
      { key: "buyer" as const, role: "USER" as const },
    ];
    for (const { key, role } of actors) {
      const row = await prisma.user.create({
        data: { username: `${qaId}-${key}`, password: "synthetic-not-a-real-password", role },
      });
      ids[key] = row.id;
      if (key === "admin" || key === "moderator" || key === "user") {
        authTokens[key] = await generateAccessToken({ id: row.id, role, username: row.username });
      }
    }
    const profile = await prisma.partnerProfile.create({ data: { userId: ids.partner! } });
    partnerId = profile.id;
    const payment = await prisma.appSubscriptionPayment.create({
      data: {
        userId: ids.buyer!, provider: "YOOKASSA", kind: "INITIAL", status: "SUCCEEDED",
        planCode: "MONTHLY", amount: "250.00", currency: "RUB",
        idempotenceKey: `${qaId}-payment`, yookassaPaymentId: `${qaId}-yk`,
        succeededAt: new Date("2026-10-21T12:00:00Z"),
        providerCapturedAt: new Date("2026-10-21T12:00:00Z"),
        providerIncomeAmount: "240.00", providerPaymentMethodType: "bank_card",
        financeRefundsIncomplete: false,
      },
    });
    paymentId = payment.id;
    await prisma.partnerCommission.create({
      data: { partnerId, paymentId, amountKopecks: 2500, kind: "EARNED",
        createdAt: new Date("2026-10-21T12:00:01Z") },
    });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it("verifies real JWT / guest 401 / user and moderator policy", async () => {
    expect((await request("/api/v1/admin/users")).status).toBe(401);
    expect((await request("/api/v1/admin/users", { token: "invalid.jwt" })).status).toBe(401);
    expect((await request("/api/v1/admin/users", { actor: "user" })).status).toBe(403);
    const admin = await request("/api/v1/admin/users", { actor: "admin" });
    const moderator = await request("/api/v1/admin/users", { actor: "moderator" });
    expect(admin.status).toBe(200);
    expect(moderator.status).toBe(200);
    expect(admin.headers.get("cache-control")).toContain("no-store");
    const json = await admin.json();
    expect(json.success).toBe(true);
    expect(json.data.users.some((row: { id: string }) => row.id === ids.user)).toBe(true);
    expect((await request("/api/v1/admin/partners", { actor: "moderator" })).status).toBe(403);
    expect((await request("/api/v1/admin/profit", { actor: "moderator" })).status).toBe(403);
  });

  it("persists user PATCH, refuses moderator promotion, rereads real database", async () => {
    const username = `${qaId}-renamed`;
    const update = await request(`/api/v1/admin/users/${ids.user}`, {
      actor: "admin", method: "PATCH", body: { username, email: `${qaId}@example.test` },
    });
    expect(update.status).toBe(200);
    expect(await prisma.user.findUnique({
      where: { id: ids.user }, select: { username: true, email: true },
    }))
      .toEqual({ username, email: `${qaId}@example.test` });
    expect((await request(`/api/v1/admin/users/${ids.user}`, {
      actor: "moderator", method: "PATCH", body: { role: "ADMIN" },
    })).status).toBe(403);
    expect((await request(`/api/v1/admin/users/${ids.admin}`, {
      actor: "moderator", method: "DELETE",
    })).status).toBe(403);
    expect((await prisma.user.findUnique({
      where: { id: ids.user }, select: { role: true },
    }))?.role)
      .toBe("USER");
  });

  it("persists partner payout once and rejects duplicate payout", async () => {
    const list = await request("/api/v1/admin/partners", { actor: "admin" });
    expect(list.status).toBe(200);
    const details = await request(`/api/v1/admin/partners/${partnerId}`, { actor: "admin" });
    expect(details.status).toBe(200);
    const before = await details.json();
    expect(before.data.availableKopecks).toBe(2500);
    expect((await request(`/api/v1/admin/partners/${partnerId}/mark-paid`, {
      actor: "admin", method: "POST",
    })).status).toBe(200);
    expect((await request(`/api/v1/admin/partners/${partnerId}/mark-paid`, {
      actor: "admin", method: "POST",
    })).status).toBe(409);
    const payouts = await prisma.partnerPayout.findMany({ where: { partnerId } });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amountKopecks).toBe(2500);
    const after = await (await request(`/api/v1/admin/partners/${partnerId}`, { actor: "admin" })).json();
    expect(after.data.availableKopecks).toBe(0);
  });

  it("reads real finance totals and stores a video expense with stable idempotency", async () => {
    const requestKey = randomUUID();
    const body = { requestKey, input: {
      partnerId, paidDay: "2026-10-22", quantity: 2, comment: "QA video synthetic",
    } };
    expect((await request("/api/v1/admin/profit/video-expenses", {
      actor: "admin", method: "POST", body,
    })).status).toBe(200);
    expect((await request("/api/v1/admin/profit/video-expenses", {
      actor: "admin", method: "POST", body,
    })).status).toBe(200);
    const expense = await prisma.profitVideoExpense.findUnique({ where: { requestKey } });
    expect(expense).not.toBeNull();
    expenseId = expense!.id;
    expect(await prisma.profitVideoExpense.count({ where: { requestKey } })).toBe(1);
    const report = await request("/api/v1/admin/profit?from=2026-10-20&to=2026-10-23", {
      actor: "admin",
    });
    expect(report.status).toBe(200);
    const result = (await report.json()).data;
    expect(result.videos.some((row: { id: string }) => row.id === expenseId)).toBe(true);
    // Independent SQL aggregates: repeated synthetic QA runs cannot skew expected totals.
    const start = new Date("2026-10-19T20:00:00Z");
    const end = new Date("2026-10-23T20:00:00Z");
    const [payments, commissions, videos] = await Promise.all([
      prisma.appSubscriptionPayment.findMany({
        where: { provider: "YOOKASSA", status: { in: ["SUCCEEDED", "REFUNDED"] },
          providerCapturedAt: { gte: start, lt: end } },
        select: { amount: true, providerIncomeAmount: true },
      }),
      prisma.partnerCommission.aggregate({
        where: { createdAt: { gte: start, lt: end } },
        _sum: { amountKopecks: true },
      }),
      prisma.profitVideoExpense.aggregate({
        where: { paidAt: { gte: start, lt: end }, canceledAt: null },
        _sum: { amountKopecks: true },
      }),
    ]);
    const receivedKopecks = payments.reduce((acc, row) => acc + Number(row.amount) * 100, 0);
    const feesKopecks = payments.reduce((acc, row) =>
      acc + Math.round((Number(row.amount) - Number(row.providerIncomeAmount)) * 100), 0);
    expect(result.totals.payments).toBe(receivedKopecks);
    expect(result.totals.yookassa).toBe(feesKopecks);
    expect(result.totals.npd).toBe(payments.length * 1000);
    expect(result.totals.partners).toBe(commissions._sum.amountKopecks ?? 0);
    expect(result.totals.videos).toBe(videos._sum.amountKopecks ?? 0);
    expect(result.totals.server).toBe(0);
    if (result.incompletePayments || result.undatedPayments) {
      expect(result.profitKopecks).toBeNull(); // Never invent money before reconciliation.
    } else {
      expect(result.profitKopecks).toBe(
        result.totals.payments - result.totals.refunds - result.totals.yookassa -
        result.totals.npd - result.totals.partners - result.totals.videos,
      );
    }
    expect((await request("/api/v1/admin/profit?from=2026-10-32", {
      actor: "admin",
    })).status).toBe(400);
  });

  it("persists a wallet adjustment only once, rereads ledger and audit", async () => {
    adjustmentKey = randomUUID();
    const body = { userId: ids.user!, delta: 5, requestId: adjustmentKey,
      reason: "QA manual audit correction" };
    const first = await request("/api/v1/gafus/admin/adjust", {
      actor: "admin", method: "POST", body,
    });
    expect(first.status).toBe(200);
    const replay = await request("/api/v1/gafus/admin/adjust", {
      actor: "admin", method: "POST", body,
    });
    expect(replay.status).toBe(200);
    expect((await replay.json()).data.replay).toBe(true);
    // The same key with a different reason must NOT silently reuse older audit evidence.
    const conflictingReason = await request("/api/v1/gafus/admin/adjust", {
      actor: "admin", method: "POST",
      body: { ...body, reason: "QA different reason must conflict" },
    });
    expect(conflictingReason.status).toBe(409);
    expect((await prisma.gafusWallet.findUnique({
      where: { userId: ids.user! },
    }))?.balance).toBe(5);
    expect(await prisma.gafusTransaction.count({ where: { userId: ids.user! } })).toBe(1);
    expect(await prisma.gafusAdminAudit.count({
      where: { actorId: ids.admin!, targetUserId: ids.user!, action: "WALLET_ADJUSTMENT" },
    })).toBe(1);
    expect((await request("/api/v1/gafus/admin/adjust", {
      actor: "moderator", method: "POST", body: { ...body, requestId: randomUUID() },
    })).status).toBe(403);
  });

  it("revises Gafus settings with CAS and protects against stale patches", async () => {
    const initial = await request("/api/v1/gafus/admin/dashboard", { actor: "admin" });
    expect(initial.status).toBe(200);
    const revision = (await initial.json()).data.settings.revision as number;
    const body = { expectedRevision: revision, reason: "QA planned revision", patch: {
      postReward: 1, activityLimit: 3, activityWindowSeconds: 86400,
    } };
    expect((await request("/api/v1/gafus/admin/settings", {
      actor: "admin", method: "PATCH", body,
    })).status).toBe(200);
    expect((await request("/api/v1/gafus/admin/settings", {
      actor: "admin", method: "PATCH", body,
    })).status).toBe(409);
    expect((await prisma.gafusSettings.findUnique({ where: { key: "default" } }))?.revision)
      .toBe(revision + 1);
  });

  it("confirms fraud once, caps reversal and retains audit", async () => {
    const signal = await prisma.gafusFraudSignal.create({ data: {
      userId: ids.user!, kind: "QA_SUSPECT", severity: "MEDIUM", entityType: "POST",
      entityId: `${qaId}-post`,
    } });
    signalId = signal.id;
    const body = { action: "CONFIRM", reason: "QA verified signal", requestedReversal: 100 };
    const first = await request(`/api/v1/admin/gafus-operations/fraud/${signalId}/review`, {
      actor: "admin", method: "POST", body,
    });
    expect(first.status).toBe(200);
    expect((await first.json()).data.recovered).toBe(5);
    expect((await request(`/api/v1/admin/gafus-operations/fraud/${signalId}/review`, {
      actor: "admin", method: "POST", body,
    })).status).toBe(409);
    expect((await prisma.gafusWallet.findUnique({
      where: { userId: ids.user! },
    }))?.balance).toBe(0);
    expect(await prisma.gafusAdminAudit.count({
      where: { actorId: ids.admin!, action: "FRAUD_CONFIRMED", targetUserId: ids.user! },
    })).toBe(1);
    const listed = await request("/api/v1/admin/gafus-operations/fraud?status=RESOLVED", {
      actor: "admin",
    });
    expect(listed.status).toBe(200);
    expect((await listed.json()).data.some(
      (row: { id: string }) => row.id === signalId,
    )).toBe(true);
  });

  it("invalidates a previously valid moderator JWT after database demotion", async () => {
    await prisma.user.update({ where: { id: ids.moderator }, data: { role: "USER" } });
    expect((await request("/api/v1/admin/users", { actor: "moderator" })).status).toBe(401);
  });
});
