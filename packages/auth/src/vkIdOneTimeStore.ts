/**
 * Web VK login grants. The previous VkIdOneTimeLogin table is intentionally
 * never read: migration expiry makes legacy opaque tokens a restart-OAuth case.
 */
import crypto from "crypto";

import { prisma, VkLoginGrantPurpose } from "@gafus/prisma";

export interface VkIdUser {
  userId: string;
  username: string;
  role: string;
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Compatibility entrypoint for completed-account web OAuth only. */
export async function storeVkIdOneTimeUser(token: string, user: VkIdUser, requiresConsent = false): Promise<string> {
  if (requiresConsent) throw new Error("VK registration context required; restart OAuth");
  const active = await prisma.user.findUnique({
    where: { id: user.userId }, select: { registrationPending: true },
  });
  if (!active || active.registrationPending) throw new Error("VK registration is not completed");
  await prisma.vkLoginGrant.create({
    data: {
      tokenHash: tokenHash(token), userId: user.userId, purpose: VkLoginGrantPurpose.LOGIN,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });
  return token;
}

/** Consumes only LOGIN grants, atomically requiring a completed user. */
export async function consumeVkIdOneTimeUser(token: string): Promise<VkIdUser | null> {
  const now = new Date();
  const record = await prisma.vkLoginGrant.findFirst({
    where: { tokenHash: tokenHash(token), purpose: VkLoginGrantPurpose.LOGIN, expiresAt: { gt: now }, consumedAt: null },
    include: { user: { select: { id: true, username: true, role: true, registrationPending: true } } },
  });
  if (!record || record.user.registrationPending) return null;
  const consumed = await prisma.vkLoginGrant.updateMany({
    where: {
      id: record.id, purpose: VkLoginGrantPurpose.LOGIN, expiresAt: { gt: now }, consumedAt: null,
      user: { registrationPending: false },
    },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) return null;
  return { userId: record.user.id, username: record.user.username, role: record.user.role };
}

/** Legacy consent tokens cannot be upgraded into an authorization context. */
export async function getVkIdUserFromToken(_token: string): Promise<VkIdUser | null> {
  return null;
}

/** Legacy consent tokens cannot complete pending registration. */
export async function completeVkIdOneTimeConsent(_token: string): Promise<"invalid"> {
  return "invalid";
}
