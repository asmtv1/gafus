import { subscriptionAccessPort } from "../app-subscription/composition/subscription-access-instance.js";
import { getCynologistEntitlements } from "@gafus/core/services/appSubscription";
import { chat2MemberCanRead } from "@gafus/core/services/chat2";
import { allowedCourseIds } from "../content-access/composition/content-policy-instance.js";
import { revokeLiveRoomSubscription } from "./revocation.js";
import { fail } from "./errors.js";

// The only licensed specialist for the paid channel. Do not use the generic
// TRAINER role or a stale environment user ID as an authorization source.
const cynologistUsername = "lana";

export const isCynologistUsername = (name: string | null | undefined) =>
  name?.toLowerCase() === cynologistUsername;

export const reservedCynologist = {
  username: { equals: cynologistUsername, mode: "insensitive" as const },
};

export function createChatAccess(prisma: Pick<typeof import("@gafus/prisma").prisma, "$transaction" | "chat2Block" | "chat2Conversation" | "chat2Member" | "course" | "user">) {
  async function readChatCourses(userId: string, ids?: string[]) {
    const courses = await prisma.course.findMany({
      where: ids ? { id: { in: ids } } : {
        OR: [{ isPrivate: false }, { authorId: userId }, { access: { some: { userId } } }],
      },
      select: { id: true, name: true, authorId: true, isPrivate: true, isPaid: true,
        access: { where: { userId }, select: { userId: true } } },
      ...(ids ? {} : { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: 80 }),
    });
    const allowed = await allowedCourseIds(courses.filter(course => course.authorId !== userId), userId);
    return courses.filter(course => course.authorId === userId || allowed.has(course.id));
  }

  async function readGate(userId: string, conversationId: string) {
    const m = await prisma.chat2Member.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: { conversation: true },
    });
    if (m?.conversation.kind === "DIRECT") {
      const partner = await prisma.chat2Member.findFirst({
        where: { conversationId, userId: { not: userId } },
        select: { userId: true },
      });
      // A stale DIRECT room must not bypass the paid CYNOLOGIST channel.
      if (partner && await prisma.user.findFirst({
        where: { id: { in: [userId, partner.userId] }, ...reservedCynologist },
        select: { id: true },
      })) return fail("CYNOLOGIST_DIRECT_FORBIDDEN", 403, "Для связи с кинологом используйте платный чат");
      if (
        partner &&
        (await prisma.chat2Block.findFirst({
          where: {
            OR: [
              { blockerId: userId, blockedId: partner.userId },
              { blockerId: partner.userId, blockedId: userId },
            ],
          },
        }))
      )
        return fail("BLOCKED", 403, "Переписка недоступна");
    }
    if (!chat2MemberCanRead(m))
      return fail("NOT_FOUND", 404, "Диалог не найден");
    if (m.conversation.kind === "COURSE") {
      const courseId = m.conversation.scopeKey;
      if (!courseId) return fail("FORBIDDEN", 403, "Курс недоступен");
      const courses = await readChatCourses(userId, [courseId]);
      if (!courses.length)
        return fail("COURSE_ACCESS_REQUIRED", 403, "Нет доступа к курсу");
    }
    if (m.conversation.kind === "CYNOLOGIST" && m.conversation.createdById !== userId) {
      const specialist = await prisma.user.findFirst({
        where: { id: userId, role: "TRAINER", accountDeletionRequestedAt: null, ...reservedCynologist },
        select: { id: true },
      });
      if (!specialist)
        return fail("FORBIDDEN", 403, "Нет доступа");
    }
    return m;
  }

  async function writeGate(userId: string, id: string) {
    const m = await readGate(userId, id);
    if (m.conversation.kind === "CYNOLOGIST" && m.conversation.createdById === userId) {
      if (!(await getCynologistEntitlements(userId, undefined, subscriptionAccessPort)).canUseCynologistChat)
        return fail("SUBSCRIPTION_REQUIRED", 403, "Продлите тариф, чтобы писать кинологу");
      // Direct POSTs/attachments must repair stale rooms too, even if the client
      // never loaded the chat list. Otherwise a valid subscription can reach the
      // obsolete trainer before the inbox performs its one-time correction.
      const specialist = await prisma.user.findFirst({
        where: { role: "TRAINER", accountDeletionRequestedAt: null, ...reservedCynologist },
        select: { id: true },
      });
      if (!specialist) return fail("UNAVAILABLE", 503, "Кинолог недоступен");
      await alignCynologistMembers(userId, id, specialist.id);
    }
    if (m.conversation.kind === "DIRECT") {
      const other = await prisma.chat2Member.findFirst({
        where: { conversationId: id, userId: { not: userId } },
      });
      if (
        other &&
        (await prisma.chat2Block.findFirst({
          where: {
            OR: [
              { blockerId: userId, blockedId: other.userId },
              { blockerId: other.userId, blockedId: userId },
            ],
          },
        }))
      )
        return fail("BLOCKED", 403, "Переписка недоступна");
    }
    return m;
  }

  /** Self-heal rooms created with an obsolete trainer assignment, preserving message history. */
  async function alignCynologistMembers(ownerId: string, roomId: string, specialistId: string) {
    const members = await prisma.chat2Member.findMany({
      where: { conversationId: roomId }, select: { userId: true },
    });
    const allowed = [ownerId, specialistId];
    const displaced = members.filter((m) => !allowed.includes(m.userId));
    if (displaced.length || allowed.some((id) => !members.some((m) => m.userId === id))) {
      await prisma.$transaction(async (tx) => {
        for (const id of allowed) {
          await tx.chat2Member.upsert({
            where: { conversationId_userId: { conversationId: roomId, userId: id } },
            update: { hiddenAt: null },
            create: { conversationId: roomId, userId: id },
          });
        }
        await tx.chat2Member.deleteMany({
          where: { conversationId: roomId, userId: { notIn: allowed } },
        });
      });
      await Promise.all(displaced.map((m) => revokeLiveRoomSubscription(m.userId, roomId)));
    }
  }

  /** One globally scoped room; onboarding happens on the authenticated inbox GET.
   * Existing members are left untouched on every 15-second poll. A user who has
   * explicitly left can rejoin through POST /community, but not implicitly.
   */
  async function ensureCommunityMembership(userId: string, explicit: boolean): Promise<string | null> {
    const scopeKey = "global";
    const roomWhere = { kind_scopeKey: { kind: "COMMUNITY" as const, scopeKey } };
    // GET inbox is polled every 15s. The global room is almost always present:
    // read it without issuing a write/UPSERT on every client poll.
    const c = (await prisma.chat2Conversation.findUnique({ where: roomWhere })) ??
      (await prisma.chat2Conversation.upsert({
        where: roomWhere,
        update: {},
        create: { kind: "COMMUNITY", scopeKey, visibility: "PUBLIC", name: "Общий чат GAFUS" },
      }));
    const where = { conversationId_userId: { conversationId: c.id, userId } };
    const existing = await prisma.chat2Member.findUnique({ where });
    if (existing?.role === "BANNED") {
      if (explicit) return fail("BANNED", 403, "Вы исключены из общего чата");
      return null;
    }
    if (existing?.hiddenAt && !explicit) return null;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    const role = user?.role === "ADMIN" || user?.role === "MODERATOR" ? "ADMIN" : "MEMBER";
    if (!existing) {
      // Unique constraint protects concurrent first-load requests and refreshes.
      // The no-op conflict arm never unbans an account concurrently banned.
      await prisma.chat2Member.upsert({
        where,
        update: {},
        // New members see the existing history without an enormous initial unread badge.
        create: { conversationId: c.id, userId, role, lastReadSequence: c.nextSequence },
      });
    } else if (existing.role !== role || (explicit && existing.hiddenAt)) {
      await prisma.chat2Member.update({
        where: { id: existing.id },
        data: { role, ...(explicit ? { hiddenAt: null } : {}) },
      });
    }
    return c.id;
  }

  return { readChatCourses, readGate, writeGate, alignCynologistMembers, ensureCommunityMembership };
}
