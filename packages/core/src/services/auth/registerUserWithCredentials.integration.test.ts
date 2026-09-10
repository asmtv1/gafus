import crypto from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@gafus/prisma";

import { registerUserWithCredentials } from "./registerUserWithCredentials";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const runId = `registration_core_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
const ids: { users: string[]; promos: string[]; attempts: string[] } = { users: [], promos: [], attempts: [] };

function context(tempSessionId: string, username: string, email: string) {
  return {
    tempSessionId,
    consentPayload: { acceptPersonalData: true, acceptPrivacyPolicy: true, acceptDataDistribution: true },
    formData: { name: username, email },
    defaultVersion: "integration-v1",
  };
}

async function register(suffix: string, promoCode?: string, tempSessionId = crypto.randomUUID()) {
  const username = `${runId}_${suffix}`;
  const email = `${username}@example.test`;
  ids.attempts.push(tempSessionId);
  const result = await registerUserWithCredentials({
    username,
    email,
    password: "Password1x",
    promoCode,
    registrationContext: context(tempSessionId, username, email),
  });
  if (result.ok) ids.users.push(result.userId);
  return { result, username, email, tempSessionId };
}

afterEach(async () => {
  if (!databaseUrl) return;
  await prisma.registrationEmailAttempt.deleteMany({ where: { tempSessionId: { in: ids.attempts } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.partnerProfile.deleteMany({ where: { user: { username: { startsWith: runId } } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: runId } } });
  await prisma.appSubscriptionPromoCode.deleteMany({ where: { id: { in: ids.promos } } });
});

integration("registerUserWithCredentials PostgreSQL contract", () => {
  it("atomically supports no code, ordinary and current-partner code, safe replay and a same-key race", async () => {
    const noCode = await register("nocode");
    expect(noCode.result).toMatchObject({ ok: true, wasCreated: true });

    const ordinaryPromo = await prisma.appSubscriptionPromoCode.create({ data: { code: `${runId}ORD`, normalizedCode: `${runId}ORD`.toUpperCase(), discountPercent: 10, isActive: true } });
    ids.promos.push(ordinaryPromo.id);
    const ordinary = await register("ordinary", ordinaryPromo.code);
    expect(ordinary.result).toMatchObject({ ok: true, wasCreated: true });
    if (!ordinary.result.ok) throw new Error("ordinary registration unexpectedly failed");
    await expect(prisma.user.findUnique({ where: { id: ordinary.result.userId }, select: { savedRegistrationPromoCodeId: true, referredByPartner: true } }))
      .resolves.toMatchObject({ savedRegistrationPromoCodeId: ordinaryPromo.id, referredByPartner: null });

    const partnerUser = await prisma.user.create({ data: { username: `${runId}_owner`, email: `${runId}_owner@example.test`, password: "fixture", role: "PARTNER", profile: { create: {} } } });
    ids.users.push(partnerUser.id);
    const partnerPromo = await prisma.appSubscriptionPromoCode.create({ data: { code: `${runId}PARTNER`, normalizedCode: `${runId}PARTNER`.toUpperCase(), discountPercent: 10, isActive: true } });
    ids.promos.push(partnerPromo.id);
    await prisma.partnerProfile.create({ data: { userId: partnerUser.id, promoCodeId: partnerPromo.id, isActive: true } });
    const partner = await register("partner", partnerPromo.code);
    expect(partner.result).toMatchObject({ ok: true, wasCreated: true });
    if (!partner.result.ok) throw new Error("partner registration unexpectedly failed");
    await expect(prisma.partnerReferral.count({ where: { buyerId: partner.result.userId } })).resolves.toBe(1);

    await prisma.appSubscriptionPromoCode.update({ where: { id: partnerPromo.id }, data: { isActive: false } });
    const replay = await registerUserWithCredentials({ username: partner.username, email: partner.email, password: "Password1x", promoCode: partnerPromo.code, registrationContext: context(partner.tempSessionId, partner.username, partner.email) });
    expect(replay).toEqual({ ok: true, userId: partner.result.userId, wasCreated: false });

    const raceSession = crypto.randomUUID();
    const first = register("race", undefined, raceSession);
    const second = registerUserWithCredentials({ username: `${runId}_race`, email: `${runId}_race@example.test`, password: "Password1x", registrationContext: context(raceSession, `${runId}_race`, `${runId}_race@example.test`) });
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.result).toMatchObject({ ok: true });
    expect(secondResult).toMatchObject({ ok: true });
    if (!firstResult.result.ok || !secondResult.ok) throw new Error("race registration unexpectedly failed");
    ids.users.push(secondResult.userId);
    expect(secondResult.userId).toBe(firstResult.result.userId);
    await expect(prisma.user.count({ where: { username: `${runId}_race` } })).resolves.toBe(1);
    await expect(prisma.consentLog.count({ where: { tempSessionId: raceSession, status: "COMPLETED" } })).resolves.toBe(3);
  }, 30_000);

  it("rolls back invalid promo and rejects changed consent/password on replay", async () => {
    const invalid = await register("invalid", "not a valid promo");
    expect(invalid.result).toMatchObject({ ok: false, code: "PROMO_INVALID" });
    await expect(prisma.user.count({ where: { username: invalid.username } })).resolves.toBe(0);
    await expect(prisma.registrationEmailAttempt.count({ where: { tempSessionId: invalid.tempSessionId } })).resolves.toBe(0);

    const created = await register("mismatch");
    if (!created.result.ok) throw new Error("fixture registration unexpectedly failed");
    const changedConsent = await registerUserWithCredentials({ username: created.username, email: created.email, password: "Password1x", registrationContext: { ...context(created.tempSessionId, created.username, created.email), defaultVersion: "integration-v2" } });
    expect(changedConsent).toMatchObject({ ok: false, code: "ATTEMPT_MISMATCH" });
    const changedPassword = await registerUserWithCredentials({ username: created.username, email: created.email, password: "Password2x", registrationContext: context(created.tempSessionId, created.username, created.email) });
    expect(changedPassword).toMatchObject({ ok: false, code: "ATTEMPT_MISMATCH" });
  }, 30_000);
});
