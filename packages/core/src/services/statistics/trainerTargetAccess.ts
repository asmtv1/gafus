import { prisma } from "@gafus/prisma";

/** Resolve trainer-target existence from the authoritative database, never
 * from the caller's JWT or a client-provided elevation flag. */
export async function isCurrentTrainerUser(userId: string): Promise<boolean> {
  const target = await prisma.user.findUnique({
    where: { id: userId }, select: { role: true },
  });
  return target?.role === "TRAINER";
}
