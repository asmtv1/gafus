/**
 * Authenticated-admin composition supplies actor identity and enforces policy
 * in Core. These are narrow read projections only: writes still recheck both
 * current roles after ordered row locks in their own transaction.
 */
import { prisma, Prisma } from "@gafus/prisma";

export async function readAdminUserRole(userId: string) {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { role: true },
  });
  return user?.role ?? null;
}

export async function readAdminUserRoles(actorId: string, targetId: string) {
  if (!actorId || !targetId) return { actorRole: null, targetRole: null };
  const [actorRole, targetRole] = await Promise.all([
    readAdminUserRole(actorId), readAdminUserRole(targetId),
  ]);
  return { actorRole, targetRole };
}

/** Privileged list: caller must authorize an administrator before invoking. */
const adminUserSelect = {
      id: true, username: true, email: true, phone: true, role: true,
      registrationChannel: true, createdAt: true,
      profile: { select: { fullName: true, avatarUrl: true } },
      _count: { select: { pushSubscriptions: true } },
      savedRegistrationPromoCode: { select: { code: true } },
      partnerProfile: {
        select: {
          promoCodeId: true,
          promoCode: { select: { id: true, code: true, discountPercent: true } },
        },
      },
    } satisfies Prisma.UserSelect;

export function readAdminUserListRows() {
  return prisma.user.findMany({
    select: adminUserSelect,
    orderBy: { createdAt: "desc" },
  });
}
export type AdminUserPageQuery = {
  page: number; pageSize: 10 | 25 | 50; search: string;
  sort: "createdAt" | "username" | "role" | "email" | "registrationChannel" | "promoCode" | "notifications";
  direction: "asc" | "desc";
};

/** Page IDs in SQL so sorting the display name and has-push flag does not
 * require materializing all user PII, profile data and push counts in Node. */
export async function readAdminUserPage(query: AdminUserPageQuery) {
  if (!Number.isSafeInteger(query.page) || query.page < 1 || query.page > 10000 ||
      ![10,25,50].includes(query.pageSize) || query.search.length > 128) throw new Error("INVALID_PAGE");
  const text = query.search.trim();
  const pattern = "%" + text.replace(/[\\%_]/g, "\\$&") + "%";
  const hasPush = Prisma.sql`EXISTS (SELECT 1 FROM "PushSubscription" ps WHERE ps."userId" = u.id)`;
  const sorts = {
    createdAt: Prisma.sql`u."createdAt"`,
    username: Prisma.sql`lower(COALESCE(NULLIF(btrim(p."fullName"), ''), u.username))`,
    role: Prisma.sql`u.role::text`,
    email: Prisma.sql`lower(NULLIF(btrim(u.email), ''))`,
    registrationChannel: Prisma.sql`u."registrationChannel"::text`,
    promoCode: Prisma.sql`lower(NULLIF(btrim(pc.code), ''))`,
    notifications: hasPush,
  } as const;
  const order = Object.hasOwn(sorts, query.sort) ? sorts[query.sort] : undefined;
  if (!order || (query.direction !== "asc" && query.direction !== "desc")) throw new Error("INVALID_PAGE");
  const direction = query.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const joins = Prisma.sql`
    FROM "User" u
    LEFT JOIN "UserProfile" p ON p."userId" = u.id
    LEFT JOIN "AppSubscriptionPromoCode" pc ON pc.id = u."savedRegistrationPromoCodeId"
  `;
  const where = text ? Prisma.sql`WHERE
    u.username ILIKE ${pattern} OR u.email ILIKE ${pattern} OR u.id ILIKE ${pattern}
    OR p."fullName" ILIKE ${pattern} OR pc.code ILIKE ${pattern}
  ` : Prisma.empty;
  return prisma.$transaction(async tx => {
    const [count] = text
      ? await tx.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total ${joins} ${where}`
      : await tx.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total FROM "User"`;
    const total = Number(count?.total ?? 0);
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)));
    const ids = await tx.$queryRaw<{ id: string }[]>`
      SELECT u.id ${joins} ${where}
      ORDER BY ${order} ${direction} NULLS LAST, u."createdAt" DESC, u.id ASC
      LIMIT ${query.pageSize} OFFSET ${(page - 1) * query.pageSize}
    `;
    const users = await tx.user.findMany({
      where: { id: { in: ids.map(row => row.id) } }, select: adminUserSelect,
    });
    const byId = new Map(users.map(user => [user.id, user]));
    return { users: ids.flatMap(({id}) => byId.has(id) ? [byId.get(id)!] : []),
      pagination: { ...query, page, total } };
  }, { isolationLevel: "RepeatableRead" });
}
