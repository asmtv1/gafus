import { prisma } from "@gafus/prisma";

/** Public aggregate only. Adapter decides its cache TTL. */
export async function countPlatformStudents(): Promise<number> {
  return prisma.user.count({ where: { role: "USER" } });
}
