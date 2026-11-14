/** G1 review-only source: not mounted by the production Hono subscription router. */
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";

/** Authenticated caller's identity, never an arbitrary userId supplied by a client. */
export type AppleTokenInitializationDto = {
  appleAppAccountToken: string;
};

export class AppleTokenOwnerUnavailableError extends Error {
  readonly code = "APPLE_TOKEN_OWNER_UNAVAILABLE";
  constructor() {
    super("Требуется повторная авторизация");
  }
}

/**
 * Persist the Apple appAccountToken exactly once. The UPDATE's NULL predicate is
 * evaluated atomically by PostgreSQL; parallel initializers cannot overwrite a
 * winner. No remote Apple/YooKassa calls, transaction identity or token logging.
 * This is an additive candidate for an AG4-approved POST, not a GET side effect.
 */
export async function initializeAppleTokenForAuthenticatedOwner(
  authenticatedOwnerId: string,
): Promise<AppleTokenInitializationDto> {
  if (!authenticatedOwnerId) throw new AppleTokenOwnerUnavailableError();

  const previous = await prisma.user.findUnique({
    where: { id: authenticatedOwnerId },
    select: { appleAppAccountToken: true },
  });
  if (!previous) throw new AppleTokenOwnerUnavailableError();
  // A retry/legacy-purchased account performs no UPDATE at all.
  if (previous.appleAppAccountToken) {
    return { appleAppAccountToken: previous.appleAppAccountToken };
  }

  await prisma.user.updateMany({
    where: { id: authenticatedOwnerId, appleAppAccountToken: null },
    data: { appleAppAccountToken: randomUUID() },
  });

  const owner = await prisma.user.findUnique({
    where: { id: authenticatedOwnerId },
    select: { appleAppAccountToken: true },
  });
  if (!owner?.appleAppAccountToken) throw new AppleTokenOwnerUnavailableError();
  return { appleAppAccountToken: owner.appleAppAccountToken };
}
