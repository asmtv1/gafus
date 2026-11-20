/** Google Play DB adapter: owner-locked purchase identity, lifecycle and reconciliation.
 * The API owns Publisher API verification, plan classification and acknowledgement.
 * Never infer access solely from the caller's token; bind token to an owned account
 * under the same PostgreSQL transaction before changing subscription state.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma, type AppSubscriptionPlanCode, type AppSubscriptionStatus } from "@gafus/prisma";

export type GooglePlayPersistencePurchase = {
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  linkedPurchaseToken?: string;
  startTime?: string;
  subscriptionState: string;
};

export type GooglePlayPersistenceSnapshot = {
  entitled: boolean;
  pending: boolean;
  acknowledgeProduct: string | null;
  data: {
    status: AppSubscriptionStatus;
    planCode: AppSubscriptionPlanCode;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    googlePlayCheckedAt: Date;
  };
};

type GooglePlayPersistencePorts<Purchase extends GooglePlayPersistencePurchase> = {
  readPurchase: (token: string) => Promise<Purchase | null>;
  classifyPurchase: (purchase: Purchase, now: Date) => GooglePlayPersistenceSnapshot;
  makeError: (code: "OWNER_MISMATCH" | "TOKEN_INVALID") => Error;
};

export async function ensureGooglePlayAccountId(userId: string) {
  await prisma.user.updateMany({
    where: { id: userId, googlePlayAccountId: null },
    data: { googlePlayAccountId: randomBytes(32).toString("hex") },
  });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId }, select: { googlePlayAccountId: true },
  });
  return user.googlePlayAccountId;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function persistGooglePlayPurchase<Purchase extends GooglePlayPersistencePurchase>(
  token: string,
  requestingUserId: string | undefined,
  { readPurchase, classifyPurchase, makeError }: GooglePlayPersistencePorts<Purchase>,
) {
  const result = await prisma.$transaction(async (tx) => {
    // Lock this token and any replacement chain at the owner level. The Play
    // read used for the write happens under the owner lock.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('google-play-token'), hashtext(${token}))::text`;
    const existing = await tx.appSubscription.findUnique({
      where: { googlePlayPurchaseToken: token },
      select: { userId: true, googlePlaySupersededAt: true },
    });
    if (existing && requestingUserId && existing.userId !== requestingUserId)
      throw makeError("OWNER_MISMATCH");

    let purchase = requestingUserId || existing ? undefined : await readPurchase(token);
    const accountId = purchase?.externalAccountIdentifiers?.obfuscatedExternalAccountId;
    const linkedOwner = purchase?.linkedPurchaseToken ? await tx.appSubscription.findUnique({
      where: { googlePlayPurchaseToken: purchase.linkedPurchaseToken },
      select: { userId: true },
    }) : null;
    const account = accountId ? await tx.user.findUnique({
      where: { googlePlayAccountId: accountId }, select: { id: true },
    }) : null;
    const userId = requestingUserId ?? existing?.userId ?? linkedOwner?.userId ?? account?.id;
    if (!userId) throw makeError("TOKEN_INVALID");

    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('google-play-owner'), hashtext(${userId}))::text`;
    const owner = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { googlePlayAccountId: true } });
    const current = await tx.appSubscription.findUnique({
      where: { googlePlayPurchaseToken: token }, select: { googlePlaySupersededAt: true },
    });
    if (current?.googlePlaySupersededAt) return { entitled: false, pending: false, acknowledgeProduct: null };

    purchase = await readPurchase(token);
    if (!purchase) {
      if (!existing) throw makeError("TOKEN_INVALID");
      await tx.appSubscription.update({
        where: { googlePlayPurchaseToken: token },
        data: { status: "EXPIRED", googlePlayCheckedAt: new Date() },
      });
      return { entitled: false, pending: false, acknowledgeProduct: null };
    }

    const claimedAccountId = purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId;
    const predecessor = purchase.linkedPurchaseToken ? await tx.appSubscription.findUnique({
      where: { googlePlayPurchaseToken: purchase.linkedPurchaseToken }, select: { userId: true },
    }) : null;
    if ((claimedAccountId && claimedAccountId !== owner.googlePlayAccountId) ||
        (predecessor && predecessor.userId !== userId) ||
        (!existing && !predecessor && (!claimedAccountId || claimedAccountId !== owner.googlePlayAccountId))) {
      throw makeError("OWNER_MISMATCH");
    }

    const successor = await tx.appSubscription.findFirst({
      where: { userId, googlePlayReplacesTokenHash: tokenHash(token) }, select: { id: true },
    });
    if (successor) return { entitled: false, pending: false, acknowledgeProduct: null };

    const snapshot = classifyPurchase(purchase, new Date());
    const replaces = purchase.linkedPurchaseToken && purchase.startTime && !snapshot.pending &&
      purchase.subscriptionState !== "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED"
      ? purchase.linkedPurchaseToken : null;
    const data = {
      ...snapshot.data,
      ...(replaces ? { googlePlayReplacesTokenHash: tokenHash(replaces) } : {}),
    };
    await tx.appSubscription.upsert({
      where: { googlePlayPurchaseToken: token },
      create: { ...data, userId, provider: "GOOGLE_PLAY", googlePlayPurchaseToken: token },
      update: data,
    });
    if (replaces) {
      await tx.appSubscription.updateMany({
        where: { userId, googlePlayPurchaseToken: replaces },
        data: { status: "REVOKED", googlePlaySupersededAt: new Date() },
      });
    }
    return snapshot;
  }, { timeout: 25_000 });
  return result;
}

export async function findGooglePlayReconciliationTokens() {
  return prisma.appSubscription.findMany({
    where: {
      provider: "GOOGLE_PLAY", googlePlayPurchaseToken: { not: null }, googlePlaySupersededAt: null,
      status: { in: ["ACTIVE", "PENDING", "PAST_DUE", "EXPIRED"] },
      OR: [{ googlePlayCheckedAt: null }, { googlePlayCheckedAt: { lt: new Date(Date.now() - 60 * 60_000) } }],
      AND: [{ OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date(Date.now() - 60 * 86_400_000) } }] }],
    },
    orderBy: [{ googlePlayCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    take: 20,
    select: { googlePlayPurchaseToken: true },
  });
}

export async function markGooglePlayReconciliationFailure(token: string) {
  // Rotate transient/provider failures without granting or revoking access.
  await prisma.appSubscription.updateMany({
    where: { googlePlayPurchaseToken: token },
    data: { googlePlayCheckedAt: new Date() },
  });
}
