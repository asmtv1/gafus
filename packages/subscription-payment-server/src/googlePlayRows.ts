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
  makeError: (code: "OWNER_MISMATCH" | "TOKEN_INVALID" | "UNAVAILABLE") => Error;
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

type PurchaseVersion = {
  userId: string;
  googlePlaySupersededAt: Date | null;
  version: string;
};

// PostgreSQL row version is an opaque equality token for a short-lived read.
// Unlike wall-clock timestamps, it also detects writes by older deployed code
// and two updates within the same millisecond. No new schema or durable field.
async function readPurchaseVersion(
  database: Pick<typeof prisma, "$queryRaw">, token: string,
): Promise<PurchaseVersion | null> {
  const [row] = await database.$queryRaw<PurchaseVersion[]>`
    SELECT "userId", "googlePlaySupersededAt", xmin::text AS version
    FROM "AppSubscription" WHERE "googlePlayPurchaseToken" = ${token}
  `;
  return row ?? null;
}

const staleSnapshot = Symbol("stale-google-play-snapshot");
const inactiveSnapshot = { entitled: false, pending: false, acknowledgeProduct: null } as const;

export async function persistGooglePlayPurchase<Purchase extends GooglePlayPersistencePurchase>(
  token: string,
  requestingUserId: string | undefined,
  { readPurchase, classifyPurchase, makeError }: GooglePlayPersistencePorts<Purchase>,
) {
  // Fetch without holding a transaction/pool slot or a user-wide lock. If
  // another sync changes the row before we can apply this response, discard it
  // and fetch again. Never apply an old response over a newer verified write.
  for (let attempt = 0; attempt < 3; attempt++) {
    const observed = await readPurchaseVersion(prisma, token);
    if (observed && requestingUserId && observed.userId !== requestingUserId)
      throw makeError("OWNER_MISMATCH");
    if (observed?.googlePlaySupersededAt) return inactiveSnapshot;
    const purchase = await readPurchase(token);

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('google-play-token'), hashtext(${token}))::text`;
      const existing = await readPurchaseVersion(tx, token);
      if (existing && requestingUserId && existing.userId !== requestingUserId)
        throw makeError("OWNER_MISMATCH");
      if (existing?.googlePlaySupersededAt) return inactiveSnapshot;
      if (existing?.version !== observed?.version) return staleSnapshot;

      const claimedAccountId = purchase?.externalAccountIdentifiers?.obfuscatedExternalAccountId;
      const linkedOwner = purchase?.linkedPurchaseToken ? await tx.appSubscription.findUnique({
        where: { googlePlayPurchaseToken: purchase.linkedPurchaseToken },
        select: { userId: true },
      }) : null;
      const account = claimedAccountId ? await tx.user.findUnique({
        where: { googlePlayAccountId: claimedAccountId }, select: { id: true },
      }) : null;
      const userId = requestingUserId ?? existing?.userId ?? linkedOwner?.userId ?? account?.id;
      if (!userId) throw makeError("TOKEN_INVALID");

      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('google-play-owner'), hashtext(${userId}))::text`;
      const current = await readPurchaseVersion(tx, token);
      if (current?.googlePlaySupersededAt) return inactiveSnapshot;
      if (current?.version !== observed?.version) return staleSnapshot;
      const owner = await tx.user.findUniqueOrThrow({
        where: { id: userId }, select: { googlePlayAccountId: true },
      });
      if (!purchase) {
        if (!current) throw makeError("TOKEN_INVALID");
        await tx.appSubscription.update({
          where: { googlePlayPurchaseToken: token },
          data: { status: "EXPIRED", googlePlayCheckedAt: new Date() },
        });
        return inactiveSnapshot;
      }

      // Re-read predecessor under the owner lock. A pending replacement does
      // not revoke paid time; a committed successor cannot be resurrected.
      const predecessor = purchase.linkedPurchaseToken ? await tx.appSubscription.findUnique({
        where: { googlePlayPurchaseToken: purchase.linkedPurchaseToken }, select: { userId: true },
      }) : null;
      if ((claimedAccountId && claimedAccountId !== owner.googlePlayAccountId) ||
          (predecessor && predecessor.userId !== userId) ||
          (!current && !predecessor && (!claimedAccountId || claimedAccountId !== owner.googlePlayAccountId))) {
        throw makeError("OWNER_MISMATCH");
      }
      const successor = await tx.appSubscription.findFirst({
        where: { userId, googlePlayReplacesTokenHash: tokenHash(token) }, select: { id: true },
      });
      if (successor) return inactiveSnapshot;

      const snapshot = classifyPurchase(purchase, new Date());
      const replaces = purchase.linkedPurchaseToken && purchase.linkedPurchaseToken !== token &&
        purchase.startTime && !snapshot.pending &&
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
    if (result !== staleSnapshot) return result;
  }
  // A later RTDN/reconciliation can retry; never write the contested snapshot.
  throw makeError("UNAVAILABLE");
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
    select: { googlePlayPurchaseToken: true, googlePlayCheckedAt: true },
  });
}

export async function markGooglePlayReconciliationFailure(token: string, observedCheckedAt: Date | null) {
  // Rotate transient/provider failures without granting or revoking access.
  await prisma.appSubscription.updateMany({
    where: { googlePlayPurchaseToken: token, googlePlayCheckedAt: observedCheckedAt, googlePlaySupersededAt: null },
    data: { googlePlayCheckedAt: new Date() },
  });
}
