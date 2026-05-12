import { randomUUID } from "node:crypto";

import { prisma } from "@gafus/prisma";

export async function ensureAppleAppAccountToken(userId: string): Promise<string> {
  const user = await (prisma as any).user.findUnique({
    where: { id: userId },
    select: { appleAppAccountToken: true },
  });

  if (user?.appleAppAccountToken) {
    return user.appleAppAccountToken;
  }

  const token = randomUUID();
  const updated = await (prisma as any).user.update({
    where: { id: userId },
    data: { appleAppAccountToken: token },
    select: { appleAppAccountToken: true },
  });

  return updated.appleAppAccountToken as string;
}
