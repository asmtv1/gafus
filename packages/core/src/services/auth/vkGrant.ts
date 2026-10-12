import { createHash } from "node:crypto";
import { prisma, VkLoginGrantPurpose } from "@gafus/prisma";

export interface VkIdUser {
  userId: string;
  username: string;
  role: string;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function storeVkIdOneTimeUser(token: string, user: VkIdUser, requiresConsent = false): Promise<string> {
  if (requiresConsent) throw new Error("VK registration context required; restart OAuth");
  const active = await prisma.user.findUnique({
    where: { id: user.userId }, select: { registrationPending: true },
  });
  if (!active || active.registrationPending) throw new Error("VK registration is not completed");
  await prisma.vkLoginGrant.create({
    data: {
      tokenHash: hashToken(token), userId: user.userId, purpose: VkLoginGrantPurpose.LOGIN,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });
  return token;
}

export async function consumeVkIdOneTimeUser(token: string): Promise<VkIdUser | null> {
  const now = new Date();
  const record = await prisma.vkLoginGrant.findFirst({
    where: { tokenHash: hashToken(token), purpose: VkLoginGrantPurpose.LOGIN,
      expiresAt: { gt: now }, consumedAt: null },
    include: { user: { select: { id: true, username: true, role: true, registrationPending: true } } },
  });
  if (!record || record.user.registrationPending) return null;
  const claimed = await prisma.vkLoginGrant.updateMany({
    where: { id: record.id, purpose: VkLoginGrantPurpose.LOGIN,
      expiresAt: { gt: now }, consumedAt: null,
      user: { registrationPending: false } },
    data: { consumedAt: now },
  });
  if (claimed.count !== 1) return null;
  return { userId: record.user.id, username: record.user.username, role: record.user.role };
}

/** Legacy consent grants never authorize LOGIN. */
export async function getVkIdUserFromToken(_token: string): Promise<VkIdUser | null> {
  return null;
}
export async function completeVkIdOneTimeConsent(_token: string): Promise<"invalid"> {
  return "invalid";
}
