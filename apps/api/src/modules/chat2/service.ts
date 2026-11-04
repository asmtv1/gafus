/** Chat 2.0: durable actor-scoped operations; never trust client role or channel ID. */
import { prisma, Prisma } from "@gafus/prisma";
import { getCynologistEntitlements } from "@gafus/core/services/appSubscription";
import { chat2MemberCanRead } from "@gafus/core/services/chat2";
import { checkCourseAccessById } from "@gafus/core/services/course";
import {
  chat2ReservePrivateObjectKey,
  chat2UploadPrivateImageOrPdf,
  chat2SignedPrivateMedia,
  chat2DeletePrivateMedia,
  getSignedDownloadUrl,
} from "@gafus/cdn-upload";

import { revokeLiveRoomSubscription } from "./revocation.js";
import { collectBlockedDirectPeerIds, collectDirectInboxPeerIds } from "./inboxVisibility.js";
import { dto } from "./messageDto.js";
export { dto } from "./messageDto.js";

export class Chat2Error extends Error {
  constructor(
    public code: string,
    public status: 400 | 403 | 404 | 409 | 429 | 503,
    message: string,
  ) {
    super(message);
  }
}
const fail = (code: string, status: Chat2Error["status"], message: string): never => {
  throw new Chat2Error(code, status, message);
};

// Signed pictures expire after 10 minutes. Reuse their URLs for eight to
// avoid forcing a new image download on every 12-15s chat-list refresh.
// Ephemeral and bounded: no signed links are persisted to DB or logs.
const avatarSignCache = new Map<string, { url: string; until: number }>();
const avatarCacheTtlMs = 8 * 60 * 1000;
const avatarCacheMax = 512;

/** Never send private S3 object keys or untrusted URL schemes to chat clients. */
export async function chat2MemberAvatarUrl(raw: string | null): Promise<string | null> {
  if (!raw) return null;
  if (raw.startsWith("isodev-avatar:")) {
    const now = Date.now();
    const cached = avatarSignCache.get(raw);
    if (cached && cached.until > now) return cached.url;
    if (cached) avatarSignCache.delete(raw);
    try {
      const signed = await getSignedDownloadUrl(raw, 600);
      if (avatarSignCache.size >= avatarCacheMax) {
        const oldestKey = avatarSignCache.keys().next().value;
        if (oldestKey) avatarSignCache.delete(oldestKey);
      }
      avatarSignCache.set(raw, { url: signed, until: now + avatarCacheTtlMs });
      return signed;
    } catch {
      // A missing isolated S3 endpoint cannot block the conversation itself.
      return null;
    }
  }
  if (raw.startsWith("/") && !raw.startsWith("//") &&
      ![...raw].some((char) => {
        const code = char.charCodeAt(0);
        return code <= 31 || code === 127 || code === 92;
      })) return raw;
  try {
    const url = new URL(raw);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !!url.hostname && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

const groupKinds = ["GROUP", "CITY", "BREED", "COURSE_TOPIC"] as const;
// The only licensed specialist for the paid channel. Do not use the generic
// TRAINER role or a stale environment user ID as an authorization source.
const cynologistUsername = "lana";
const isCynologistUsername = (name: string | null | undefined) =>
  name?.toLowerCase() === cynologistUsername;
const reservedCynologist = {
  username: { equals: cynologistUsername, mode: "insensitive" as const },
};


/** Never expose private keys; signed URLs are short-lived and membership-scoped. */
const roomAvatarCache = new Map<string, { url: string; until: number }>();
async function roomAvatarUrl(avatarMediaId: string | null): Promise<string | null> {
  if (!avatarMediaId) return null;
  const media = await prisma.chat2Media.findFirst({
    where: { id: avatarMediaId, status: "AVATAR" },
    select: { objectKey: true },
  });
  if (!media) return null;
  const now = Date.now();
  const cached = roomAvatarCache.get(media.objectKey);
  if (cached?.until && cached.until > now) return cached.url;
  if (cached) roomAvatarCache.delete(media.objectKey);
  try {
    const url = await chat2SignedPrivateMedia(media.objectKey, 60);
    if (roomAvatarCache.size >= 512) {
      const first = roomAvatarCache.keys().next().value;
      if (first) roomAvatarCache.delete(first);
    }
    roomAvatarCache.set(media.objectKey, { url, until: now + 40_000 });
    return url;
  } catch { return null; }
}

async function groupAvatarActor(userId: string, id: string) {
  const actor = await readGate(userId, id);
  if (!groupKinds.some((kind) => kind === actor.conversation.kind) ||
      !["OWNER", "ADMIN"].includes(actor.role))
    return fail("FORBIDDEN", 403, "Нет прав на изменение аватарки группы");
  return actor;
}

export async function readGate(userId: string, conversationId: string) {
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
    if (
      m.conversation.createdById !== userId &&
      !(await checkCourseAccessById(courseId, userId)).hasAccess
    )
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
export async function writeGate(userId: string, id: string) {
  const m = await readGate(userId, id);
  if (m.conversation.kind === "CYNOLOGIST" && m.conversation.createdById === userId) {
    if (!(await getCynologistEntitlements(userId)).canUseCynologistChat)
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
export async function listChats(userId: string) {
  // Lazy, idempotent onboarding for existing AND new users, including Mobile.
  // A voluntary exit remains hidden; bans never rejoin automatically.
  const communityId = await ensureCommunityMembership(userId, false);
  const ms = await prisma.chat2Member.findMany({
    where: { userId, hiddenAt: null, role: { not: "BANNED" } },
    include: {
      conversation: {
        include: {
          messages: { orderBy: { sequence: "desc" }, take: 1, include: { attachments: true } },
          members: { include: { user: { select: {
            username: true, profile: { select: { avatarUrl: true } },
          } } }, take: 50 },
        },
      },
    },
    orderBy: { conversation: { updatedAt: "desc" } },
    take: 100,
  });
  // On the first inbox fetch, fix the already-created specialist room as well.
  // This prevents stale `trainer` from appearing before the user clicks into it.
  const stale = ms.filter((m) =>
    m.conversation.kind === "CYNOLOGIST" && m.conversation.createdById === userId &&
    (m.conversation.members.length !== 2 ||
      !m.conversation.members.some((x) => x.userId === userId) ||
      !m.conversation.members.some((x) => isCynologistUsername(x.user.username))),
  );
  if (stale.length) {
    const specialist = await prisma.user.findFirst({
      where: { role: "TRAINER", accountDeletionRequestedAt: null, ...reservedCynologist },
      select: { id: true },
    });
    if (!specialist) return fail("UNAVAILABLE", 503, "Кинолог недоступен");
    for (const m of stale) await alignCynologistMembers(userId, m.conversation.id, specialist.id);
    // Fetch the corrected membership once; the user's messages stay intact.
    const corrected = await prisma.chat2Member.findMany({
      where: { userId, hiddenAt: null, role: { not: "BANNED" } },
      include: {
        conversation: {
          include: {
            messages: { orderBy: { sequence: "desc" }, take: 1, include: { attachments: true } },
            members: { include: { user: { select: {
              username: true, profile: { select: { avatarUrl: true } },
            } } }, take: 50 },
          },
        },
      },
      orderBy: { conversation: { updatedAt: "desc" } },
      take: 100,
    });
    // Reuse the normal DTO filtering after a one-time repair without recursion.
    ms.splice(0, ms.length, ...corrected);
  }
  // A very large inbox can evict an older community from the 100 most recent.
  // Always include it without expanding the response or losing other permissions.
  if (communityId && ms.length === 100 &&
      !ms.some((m) => m.conversationId === communityId)) {
    const pinned = await prisma.chat2Member.findUnique({
      where: { conversationId_userId: { conversationId: communityId, userId } },
      include: {
        conversation: {
          include: {
            messages: { orderBy: { sequence: "desc" }, take: 1, include: { attachments: true } },
            members: { include: { user: { select: {
              username: true, profile: { select: { avatarUrl: true } },
            } } }, take: 50 },
          },
        },
      },
    });
    if (pinned && pinned.hiddenAt === null && pinned.role !== "BANNED") {
      ms.pop();
      ms.unshift(pinned);
    }
  }
  // Keep the default community at the top; all other chats retain their order.
  ms.sort((a, b) => Number(b.conversation.kind === "COMMUNITY") -
    Number(a.conversation.kind === "COMMUNITY"));
  // One indexed read for all direct counterparts, not N database round-trips.
  // The inbox is bounded to 100 memberships above; block enforcement when
  // opening/sending still happens independently in readGate/writeGate.
  const directPeerIds = collectDirectInboxPeerIds(ms, userId);
  const blockRows = directPeerIds.length ? await prisma.chat2Block.findMany({
    where: { OR: [
      { blockerId: userId, blockedId: { in: directPeerIds } },
      { blockedId: userId, blockerId: { in: directPeerIds } },
    ] },
    select: { blockerId: true, blockedId: true },
  }) : [];
  const blockedDirectPeers = collectBlockedDirectPeerIds(userId, blockRows);
  // Specialist identity is invariant across this inbox. Avoid N identical user
  // lookups when a trainer belongs to several assigned specialist rooms.
  const needsSpecialist = ms.some(m => m.conversation.kind === "CYNOLOGIST" &&
    m.conversation.createdById !== userId);
  const isSpecialist = needsSpecialist && Boolean(await prisma.user.findFirst({
    where: { id: userId, role: "TRAINER", accountDeletionRequestedAt: null, ...reservedCynologist },
    select: { id: true },
  }));
  const eligible = await Promise.all(
    ms.map(async (m) => {
      if (m.conversation.kind === "CYNOLOGIST")
        return (
          m.conversation.createdById === userId || isSpecialist
        );
      if (m.conversation.kind === "COURSE")
        return (
          Boolean(m.conversation.scopeKey) &&
          (m.conversation.createdById === userId ||
            (await checkCourseAccessById(m.conversation.scopeKey!, userId)).hasAccess)
        );
      if (m.conversation.kind === "DIRECT") {
        // Hide any pre-existing private lane: no active alternative to paid access.
        if (m.conversation.members.some((x) => isCynologistUsername(x.user.username))) return false;
        const other = m.conversation.members.find((other) => other.userId !== userId);
        if (other && blockedDirectPeers.has(other.userId)) return false;
      }
      return true;
    }),
  );
  return Promise.all(ms
    .filter((_, i) => eligible[i])
    .map(async (m) => ({
      id: m.conversation.id,
      kind: m.conversation.kind,
      name: m.conversation.name,
      description: m.conversation.description,
      avatarUrl: await roomAvatarUrl(m.conversation.avatarMediaId),
      visibility: m.conversation.visibility,
      createdById: m.conversation.createdById,
      role: m.role,
      muted: Boolean(m.mutedUntil && m.mutedUntil > new Date()),
      unreadCount: Math.max(0, Number(m.conversation.nextSequence - m.lastReadSequence)),
      lastSequence: m.conversation.nextSequence.toString(),
      members: await Promise.all(m.conversation.members.map(async (x) => ({
        userId: x.userId,
        username: x.user.username,
        role: x.role,
        avatarUrl: await chat2MemberAvatarUrl(x.user.profile?.avatarUrl ?? null),
      }))),
      lastMessage: m.conversation.messages[0] ? dto(m.conversation.messages[0]) : null,
    })));
}
export async function openDirect(userId: string, otherId: string) {
  if (userId === otherId) return fail("SELF", 400, "Нельзя писать самому себе");
  const other = await prisma.user.findUnique({
    where: { id: otherId },
    select: { accountDeletionRequestedAt: true },
  });
  if (!other || other.accountDeletionRequestedAt)
    return fail("USER_NOT_FOUND", 404, "Пользователь не найден");
  if (await prisma.user.findFirst({
    where: { id: { in: [userId, otherId] }, ...reservedCynologist },
    select: { id: true },
  })) return fail("CYNOLOGIST_DIRECT_FORBIDDEN", 403, "Для связи с кинологом используйте платный чат");
  if (
    await prisma.chat2Block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: otherId },
          { blockerId: otherId, blockedId: userId },
        ],
      },
    })
  )
    return fail("BLOCKED", 403, "Переписка недоступна");
  const directKey = `dm:${[userId, otherId].sort().join(":")}`;
  let conversationId: string;
  try {
    const c = await prisma.chat2Conversation.upsert({
      where: { directKey },
      update: {},
      create: {
        kind: "DIRECT",
        directKey,
        createdById: userId,
        members: { create: [{ userId }, { userId: otherId }] },
      },
    });
    conversationId = c.id;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
      throw error;
    const winner = await prisma.chat2Conversation.findUnique({
      where: { directKey },
      select: { id: true },
    });
    if (!winner) throw error;
    conversationId = winner.id;
  }
  await prisma.chat2Member.updateMany({
    where: { conversationId, userId },
    data: { hiddenAt: null },
  });
  return { conversationId };
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

export async function openCynologist(userId: string) {
  if (!(await getCynologistEntitlements(userId)).canUseCynologistChat)
    return fail("SUBSCRIPTION_REQUIRED", 403, "Чат с кинологом недоступен по тарифу");
  const trainer = await prisma.user.findFirst({
    where: { role: "TRAINER", accountDeletionRequestedAt: null, ...reservedCynologist },
    select: { id: true },
  });
  if (!trainer || trainer.id === userId) return fail("UNAVAILABLE", 503, "Кинолог недоступен");
  const directKey = `cyno:${userId}`;
  const c = await prisma.chat2Conversation.upsert({
    where: { directKey },
    update: {},
    create: {
      kind: "CYNOLOGIST",
      directKey,
      createdById: userId,
      members: { create: [{ userId }, { userId: trainer.id }] },
    },
  });
  // Upsert does not update members in an existing room.
  await alignCynologistMembers(userId, c.id, trainer.id);
  return { conversationId: c.id };
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

/** Explicit entry point retained for Mobile and rejoining after an opt-out. */
export async function openCommunity(userId: string) {
  const conversationId = await ensureCommunityMembership(userId, true);
  return { conversationId: conversationId! };
}
/** Only list courses this exact actor could currently open.
 * Privacy filtering and expensive entitlement checks always run on the server. */
export async function accessibleCourseRooms(userId: string) {
  const courses = await prisma.course.findMany({
    where: { OR: [{ isPrivate: false }, { authorId: userId }, { access: { some: { userId } } }] },
    select: { id: true, name: true, authorId: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const allowed = await Promise.all(
    courses.map(async (course) => ({
      id: course.id,
      name: course.name,
      hasAccess:
        course.authorId === userId || (await checkCourseAccessById(course.id, userId)).hasAccess,
    })),
  );
  return allowed.filter((course) => course.hasAccess).map(({ id, name }) => ({ id, name }));
}
/** Course rooms use the existing central course entitlement policy and a single course-scoped conversation. */
export async function openCourse(userId: string, courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, name: true, authorId: true },
  });
  if (!course) return fail("COURSE_NOT_FOUND", 404, "Курс не найден");
  if (course.authorId !== userId && !(await checkCourseAccessById(course.id, userId)).hasAccess)
    return fail("COURSE_ACCESS_REQUIRED", 403, "Нет доступа к курсу");
  const c = await prisma.chat2Conversation.upsert({
    where: { kind_scopeKey: { kind: "COURSE", scopeKey: course.id } },
    update: {},
    create: {
      kind: "COURSE",
      scopeKey: course.id,
      visibility: "PRIVATE",
      createdById: course.authorId,
      name: `Курс: ${course.name.slice(0, 110)}`,
    },
  });
  await prisma.chat2Member.upsert({
    where: { conversationId_userId: { conversationId: c.id, userId } },
    update: { hiddenAt: null },
    create: { conversationId: c.id, userId, role: course.authorId === userId ? "OWNER" : "MEMBER" },
  });
  return { conversationId: c.id };
}
export async function createGroup(
  userId: string,
  data: {
    name: string;
    description?: string;
    visibility: "PUBLIC" | "PRIVATE" | "UNLISTED";
    kind: "GROUP" | "CITY" | "BREED" | "COURSE_TOPIC";
  },
) {
  const count = await prisma.chat2Conversation.count({
    where: {
      createdById: userId,
      createdAt: { gte: new Date(Date.now() - 86400000) },
      kind: { in: ["GROUP", "CITY", "BREED", "COURSE_TOPIC"] },
    },
  });
  if (count >= 5) return fail("GROUP_CREATION_LIMIT", 429, "Не более пяти групп в сутки");
  const c = await prisma.chat2Conversation.create({
    data: { ...data, createdById: userId, members: { create: { userId, role: "OWNER" } } },
  });
  return { conversationId: c.id };
}
export async function discover(userId: string, search?: string) {
  const cs = await prisma.chat2Conversation.findMany({
    where: {
      // Include the default room so a user who opted out can rejoin.
      kind: { in: ["GROUP", "CITY", "BREED", "COURSE_TOPIC", "COMMUNITY"] },
      visibility: "PUBLIC",
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    },
    select: {
      id: true,
      name: true,
      kind: true,
      description: true,
      avatarMediaId: true,
      _count: { select: { members: { where: { hiddenAt: null, role: { not: "BANNED" } } } } },
      members: { where: { userId, hiddenAt: null, role: { not: "BANNED" } }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return Promise.all(cs.map(async (c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    description: c.description,
    avatarUrl: await roomAvatarUrl(c.avatarMediaId),
    memberCount: c._count.members,
    joined: c.members.length > 0,
  })));
}
export async function joinGroup(userId: string, id: string) {
  const c = await prisma.chat2Conversation.findUnique({ where: { id } });
  if (!c || c.visibility !== "PUBLIC" || !["GROUP", "CITY", "BREED", "COURSE_TOPIC", "COMMUNITY"].includes(c.kind))
    return fail("FORBIDDEN", 403, "Вступление недоступно");
  const existing = await prisma.chat2Member.findUnique({
    where: { conversationId_userId: { conversationId: id, userId } },
  });
  if (existing?.role === "BANNED") return fail("BANNED", 403, "Вы исключены из этого чата");
  await prisma.chat2Member.upsert({
    where: { conversationId_userId: { conversationId: id, userId } },
    update: { hiddenAt: null },
    create: { conversationId: id, userId },
  });
  return { conversationId: id };
}
export async function chatDetails(userId: string, id: string) {
  const m = await readGate(userId, id);
  let members = await prisma.chat2Member.findMany({
    where: { conversationId: id },
    select: { userId: true, role: true, user: { select: {
      username: true, profile: { select: { avatarUrl: true } },
    } } },
    take: 200,
  });
  if (m.conversation.kind === "CYNOLOGIST" && m.conversation.createdById === userId &&
      (members.length !== 2 || !members.some((x) => x.userId === userId) ||
       !members.some((x) => isCynologistUsername(x.user.username)))) {
    const specialist = await prisma.user.findFirst({
      where: { role: "TRAINER", accountDeletionRequestedAt: null, ...reservedCynologist },
      select: { id: true },
    });
    if (!specialist) return fail("UNAVAILABLE", 503, "Кинолог недоступен");
    await alignCynologistMembers(userId, id, specialist.id);
    members = await prisma.chat2Member.findMany({
      where: { conversationId: id },
      select: { userId: true, role: true, user: { select: {
        username: true, profile: { select: { avatarUrl: true } },
      } } },
      take: 200,
    });
  }
  return {
    id,
    kind: m.conversation.kind,
    name: m.conversation.name,
    description: m.conversation.description,
    avatarUrl: await roomAvatarUrl(m.conversation.avatarMediaId),
    visibility: m.conversation.visibility,
    role: m.role,
    muted: Boolean(m.mutedUntil && m.mutedUntil > new Date()),
    lastSequence: m.conversation.nextSequence.toString(),
    members: await Promise.all(members
      .filter((x) => x.role !== "BANNED")
      .map(async (x) => ({
        userId: x.userId,
        username: x.user.username,
        role: x.role,
        avatarUrl: await chat2MemberAvatarUrl(x.user.profile?.avatarUrl ?? null),
      }))),
  };
}
/** Fixed, safe emoji set shared by Web and Mobile. */
export const CHAT2_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"] as const;
type Chat2ReactionEmoji = (typeof CHAT2_REACTION_EMOJIS)[number];

/** A change is permanent and broadcast through the existing chat outbox. */
export async function toggleMessageReaction(
  userId: string, id: string, messageId: string, emoji: string,
) {
  await writeGate(userId, id);
  if (!CHAT2_REACTION_EMOJIS.includes(emoji as Chat2ReactionEmoji))
    return fail("INVALID_REACTION", 400, "Реакция недоступна");
  return prisma.$transaction(async (tx) => {
    const message = await tx.chat2Message.findFirst({
      where: { id: messageId, conversationId: id, deletedAt: null },
      select: { id: true },
    });
    if (!message) return fail("NOT_FOUND", 404, "Сообщение недоступно");
    const where = { messageId_userId: { messageId, userId } };
    const existing = await tx.chat2MessageReaction.findUnique({ where });
    if (existing?.emoji === emoji) {
      await tx.chat2MessageReaction.delete({ where });
    } else {
      await tx.chat2MessageReaction.upsert({
        where,
        update: { emoji },
        create: { messageId, userId, emoji },
      });
    }
    await tx.chat2OutboxEvent.create({
      data: { conversationId: id, messageId, eventType: "message.reacted" },
    });
    return { messageId, emoji, active: existing?.emoji !== emoji };
  });
}

export async function messages(userId: string, id: string, before?: bigint, after?: bigint) {
  await readGate(userId, id);
  const rows = await prisma.chat2Message.findMany({
    where: {
      conversationId: id,
      ...(before !== undefined
        ? { sequence: { lt: before } }
        : after !== undefined
          ? { sequence: { gt: after } }
          : {}),
    },
    orderBy: { sequence: after !== undefined ? "asc" : "desc" },
    take: 60,
    include: { attachments: true },
  });
  const ordered = after !== undefined ? rows : rows.reverse();
  if (!ordered.length) return [];
  const reactions = await prisma.chat2MessageReaction.findMany({
    where: { messageId: { in: ordered.map((message) => message.id) } },
    select: { messageId: true, userId: true, emoji: true },
  });
  return ordered.map((message) => ({
    ...dto(message),
    reactions: CHAT2_REACTION_EMOJIS.flatMap((emoji) => {
      const matches = reactions.filter((reaction) =>
        reaction.messageId === message.id && reaction.emoji === emoji);
      return matches.length
        ? [{ emoji, count: matches.length, mine: matches.some((r) => r.userId === userId) }]
        : [];
    }),
  }));
}
/** Redis is only a wake-up signal. PostgreSQL QUEUED is authoritative if
 * the API crashes or the signal fails after message commit. */
async function wakeCommittedChat2Media(userId:string,conversationId:string,messageId:string,ids:string[]){
  const rows=await prisma.chat2Media.findMany({
    where:{id:{in:ids},ownerId:userId,conversationId,messageId,status:"READY"},
    select:{objectKey:true},
  });
  const mediaIds=rows.filter(row=>row.objectKey.startsWith("chat2-v2:"))
    .map(row=>row.objectKey.slice("chat2-v2:".length));
  if(!mediaIds.length)return;
  const tasks=await prisma.chat2V2MediaTask.findMany({
    where:{mediaId:{in:mediaIds},status:"QUEUED"},
    select:{mediaId:true,sourceMime:true},
  });
  if(!tasks.length)return;
  const {enqueueChat2MediaProcessing}=await import("@gafus/queues");
  await Promise.allSettled(tasks.map(task=>enqueueChat2MediaProcessing(
    task.mediaId,task.sourceMime.startsWith("image/")?"photo":"video")));
}

export async function sendMessage(
  userId: string,
  id: string,
  data: { clientMessageId: string; text: string; replyToId?: string; attachmentIds?: string[] },
) {
  await writeGate(userId, id);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const sent = await prisma.$transaction(
        async (tx) => {
          const member = await tx.chat2Member.findUnique({
            where: { conversationId_userId: { conversationId: id, userId } },
          });
          if (!member || member.role === "BANNED")
            return fail("FORBIDDEN", 403, "Нет доступа к чату");
          const unique = {
            conversationId: id,
            authorId: userId,
            clientMessageId: data.clientMessageId,
          };
          const existing = await tx.chat2Message.findUnique({
            where: { conversationId_authorId_clientMessageId: unique },
            include: { attachments: true },
          });
          if (existing) {
            if (
              existing.text !== data.text ||
              existing.replyToId !== (data.replyToId ?? null) ||
              (data.attachmentIds ?? []).slice().sort().join("|") !==
                existing.attachments
                  .map((x) => x.id)
                  .sort()
                  .join("|")
            )
              return fail("MESSAGE_ID_CONFLICT", 409, "Идентификатор сообщения уже использован");
            return dto(existing);
          }
          if (
            data.replyToId &&
            !(await tx.chat2Message.findFirst({
              where: { conversationId: id, id: data.replyToId, deletedAt: null },
            }))
          )
            return fail("INVALID_REPLY", 400, "Исходное сообщение недоступно");
          const attachmentIds = [...new Set(data.attachmentIds ?? [])];
          if (
            attachmentIds.length !== (data.attachmentIds ?? []).length ||
            attachmentIds.length > 8
          )
            return fail("INVALID_ATTACHMENTS", 400, "Недопустимые вложения");
          const files = attachmentIds.length
            ? await tx.chat2Media.findMany({
                where: {
                  id: { in: attachmentIds },
                  conversationId: id,
                  ownerId: userId,
                  messageId: null,
                  status: "READY",
                },
              })
            : [];
          const roomAvatarId = attachmentIds.length
            ? (await tx.chat2Conversation.findUnique({
                where: { id }, select: { avatarMediaId: true },
              }))?.avatarMediaId
            : null;
          if (roomAvatarId && attachmentIds.includes(roomAvatarId))
            return fail("INVALID_ATTACHMENTS", 400, "Аватарка не является вложением сообщения");
          if (files.length !== attachmentIds.length)
            return fail("INVALID_ATTACHMENTS", 400, "Вложение недоступно");
          const seq = await tx.chat2Conversation.update({
            where: { id },
            data: { nextSequence: { increment: 1 } },
            select: { nextSequence: true },
          });
          const m = await tx.chat2Message.create({
            data: {
              conversationId: id,
              sequence: seq.nextSequence,
              authorId: userId,
              clientMessageId: data.clientMessageId,
              text: data.text,
              replyToId: data.replyToId,
            },
          });
          // Messages sent by the actor are read immediately; they must not inflate
          // the actor's own unread badge after a missed or delayed read request.
          await tx.chat2Member.updateMany({
            where: { conversationId: id, userId, lastReadSequence: { lt: seq.nextSequence } },
            data: { lastReadSequence: seq.nextSequence },
          });
          // A new personal message brings previously hidden dialogs back to the inbox.
          const kind = await tx.chat2Conversation.findUniqueOrThrow({
            where: { id },
            select: { kind: true },
          });
          if (kind.kind === "DIRECT")
            await tx.chat2Member.updateMany({
              where: { conversationId: id, userId: { not: userId } },
              data: { hiddenAt: null },
            });
          if (attachmentIds.length) {
            const bound = await tx.chat2Media.updateMany({
              where: {
                id: { in: attachmentIds },
                ownerId: userId,
                conversationId: id,
                messageId: null,
                status: "READY",
              },
              data: { messageId: m.id },
            });
            if (bound.count !== attachmentIds.length)
              return fail("INVALID_ATTACHMENTS", 409, "Вложение уже используется");
            // Publish first, enqueue second. This happens inside the SAME DB
            // transaction as message creation, so workers never see unsent uploads.
            const v2Ids=files.filter(file=>file.objectKey.startsWith("chat2-v2:"))
              .map(file=>file.objectKey.slice("chat2-v2:".length));
            if(v2Ids.length){
              const tasks=await tx.chat2V2MediaTask.findMany({
                where:{mediaId:{in:v2Ids},conversationId:id,ownerId:userId},
                select:{mediaId:true,status:true},
              });
              if(tasks.length!==v2Ids.length || tasks.some(task=>
                !["UPLOADED","QUEUED","PROCESSING","READY"].includes(task.status)))
                return fail("INVALID_ATTACHMENTS",409,"Вложение недоступно");
              await tx.chat2V2MediaTask.updateMany({
                where:{mediaId:{in:v2Ids},conversationId:id,ownerId:userId,status:"UPLOADED"},
                data:{status:"QUEUED",nextAttemptAt:new Date(),errorCode:null},
              });
            }
          }
          await tx.chat2OutboxEvent.create({
            data: { conversationId: id, messageId: m.id, eventType: "message.created" },
          });
          const full = await tx.chat2Message.findUniqueOrThrow({
            where: { id: m.id },
            include: { attachments: true },
          });
          return dto(full);
        },
        { isolationLevel: "Serializable" },
      );
      // The SQL commit is complete. Never delay the message response for a
      // queue outage: recovery will independently discover durable QUEUED rows.
      if(data.attachmentIds?.length)
        void wakeCommittedChat2Media(userId,id,sent.id,data.attachmentIds).catch(()=>undefined);
      return sent;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code)
      ) {
        const previous = await prisma.chat2Message.findUnique({
          where: {
            conversationId_authorId_clientMessageId: {
              conversationId: id,
              authorId: userId,
              clientMessageId: data.clientMessageId,
            },
          },
          include: { attachments: true },
        });
        if (previous) {
          if (
            previous.text !== data.text ||
            previous.replyToId !== (data.replyToId ?? null) ||
            (data.attachmentIds ?? []).slice().sort().join("|") !==
              previous.attachments
                .map((x) => x.id)
                .sort()
                .join("|")
          )
            return fail("MESSAGE_ID_CONFLICT", 409, "Идентификатор сообщения уже использован");
          return dto(previous);
        }
        if (attempt < 2) continue;
        return fail("RETRY", 503, "Отправка не завершена. Попробуйте ещё раз");
      }
      throw error;
    }
  }
  return fail("RETRY", 503, "Повторите отправку");
}
export async function editMessage(userId: string, id: string, messageId: string, text: string) {
  await writeGate(userId, id);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.chat2Message.updateMany({
      where: { id: messageId, conversationId: id, authorId: userId, deletedAt: null },
      data: { text, editedAt: new Date() },
    });
    if (!updated.count) return fail("NOT_FOUND", 404, "Сообщение не найдено");
    const message = await tx.chat2Message.findUniqueOrThrow({ where: { id: messageId } });
    await tx.chat2OutboxEvent.create({
      data: { conversationId: id, messageId, eventType: "message.edited" },
    });
    return dto(message);
  });
}
export async function deleteMessage(userId: string, id: string, messageId: string) {
  await writeGate(userId, id);
  return prisma.$transaction(async (tx) => {
    const changed = await tx.chat2Message.updateMany({
      where: { id: messageId, conversationId: id, authorId: userId, deletedAt: null },
      data: { text: "", deletedAt: new Date() },
    });
    if (!changed.count) return fail("NOT_FOUND", 404, "Сообщение не найдено");
    await tx.chat2OutboxEvent.create({
      data: { conversationId: id, messageId, eventType: "message.deleted" },
    });
    return { deleted: true };
  });
}
export async function markRead(userId: string, id: string, sequence: bigint) {
  const m = await readGate(userId, id);
  const n = sequence > m.conversation.nextSequence ? m.conversation.nextSequence : sequence;
  await prisma.chat2Member.updateMany({
    where: { id: m.id, lastReadSequence: { lt: n } },
    data: { lastReadSequence: n, hiddenAt: null },
  });
  return { lastReadSequence: n.toString() };
}
export async function blockUser(userId: string, otherId: string, blocked: boolean) {
  if (otherId === userId) return fail("SELF", 400, "Нельзя заблокировать себя");
  if (blocked) {
    const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
    if (!other) return fail("USER_NOT_FOUND", 404, "Пользователь не найден");
    const key = `dm:${[userId, otherId].sort().join(":")}`;
    const room = await prisma.chat2Conversation.findUnique({
      where: { directKey: key },
      select: { id: true },
    });
    if (room) {
      await Promise.all([
        revokeLiveRoomSubscription(userId, room.id),
        revokeLiveRoomSubscription(otherId, room.id),
      ]);
    }
    await prisma.chat2Block.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: otherId } },
      update: {},
      create: { blockerId: userId, blockedId: otherId },
    });
  } else await prisma.chat2Block.deleteMany({ where: { blockerId: userId, blockedId: otherId } });
  return { blocked };
}
export async function leaveChat(userId: string, id: string) {
  const m = await readGate(userId, id);
  if (["DIRECT", "CYNOLOGIST"].includes(m.conversation.kind))
    await prisma.chat2Member.update({ where: { id: m.id }, data: { hiddenAt: new Date() } });
  else if (m.role === "OWNER")
    return fail("OWNER_CANNOT_LEAVE", 409, "Передайте права владельца перед выходом");
  else if (m.conversation.kind === "COMMUNITY") {
    // Persist an explicit opt-out, so default inbox onboarding will not re-add.
    await revokeLiveRoomSubscription(userId, id);
    await prisma.chat2Member.update({ where: { id: m.id }, data: { hiddenAt: new Date() } });
  } else {
    await revokeLiveRoomSubscription(userId, id);
    await prisma.chat2Member.delete({ where: { id: m.id } });
  }
  return { left: true };
}
export async function inviteMember(userId: string, id: string, otherId: string) {
  const m = await readGate(userId, id);
  if (
    !["OWNER", "ADMIN"].includes(m.role) ||
    ["DIRECT", "CYNOLOGIST"].includes(m.conversation.kind)
  )
    return fail("FORBIDDEN", 403, "Нет права приглашать участников");
  const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true, username: true } });
  if (!other) return fail("USER_NOT_FOUND", 404, "Пользователь не найден");
  if (isCynologistUsername(other.username))
    return fail("CYNOLOGIST_DIRECT_FORBIDDEN", 403, "Приглашение кинолога в группу недоступно");
  if (
    await prisma.chat2Block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: otherId },
          { blockerId: otherId, blockedId: userId },
        ],
      },
    })
  )
    return fail("BLOCKED", 403, "Нельзя пригласить пользователя");
  const invitedMember = await prisma.chat2Member.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: otherId } },
  });
  if (invitedMember?.role === "BANNED") return fail("BANNED", 403, "Пользователь исключён из чата");
  await prisma.chat2Member.upsert({
    where: { conversationId_userId: { conversationId: id, userId: otherId } },
    update: { hiddenAt: null },
    create: { conversationId: id, userId: otherId },
  });
  return { conversationId: id };
}
/** Authenticated, scoped, fail-closed private media. No CDN/public URL is stored. */
export async function uploadAttachment(
  userId: string,
  id: string,
  file: { name: string; type: string; bytes: Uint8Array },
) {
  await writeGate(userId, id);
  const name =
    file.name
      .replace(/[^\p{L}\p{N} ._-]/gu, "")
      .trim()
      .slice(0, 180) || "Вложение";
  // Durable reservation PRECEDES the S3 PUT. If the process crashes during
  // a successful-but-unacknowledged upload, the reservation expires and the
  // cleanup worker deletes the orphan. Upload network timeout is 60 seconds.
  const key = chat2ReservePrivateObjectKey(id, userId, file.bytes, file.type);
  await prisma.chat2MediaDeletionIntent.create({
    data: { objectKey: key, status: "RESERVED", availableAt: new Date(Date.now() + 180_000) },
  });
  const stored = await chat2UploadPrivateImageOrPdf(id, userId, file.bytes, file.type, key);
  try {
    // Recheck membership/paid course/cynologist access AFTER a potentially
    // slow upload: membership could be revoked or the account deleted.
    await writeGate(userId, id);
    const record = await prisma.chat2Media.create({
      data: {
        conversationId: id,
        ownerId: userId,
        objectKey: stored.objectKey,
        name,
        kind: stored.kind,
        mime: stored.mime,
        bytes: stored.bytes,
        status: "READY",
      },
    });
    // If this acknowledgement fails, worker checks the live Chat2Media row
    // before deleting S3. A cascade while cleaning re-arms the trigger intent.
    await prisma.chat2MediaDeletionIntent
      .deleteMany({ where: { objectKey: key, status: "RESERVED" } })
      .catch(() => undefined);
    return {
      id: record.id,
      name: record.name,
      kind: record.kind,
      mime: record.mime,
      bytes: record.bytes,
    };
  } catch (error) {
    // An upload that reached S3 but did not produce a committed media row
    // can be cleaned immediately. If the DB is temporarily down, RESERVED
    // still expires and the worker will retry later.
    await prisma.chat2MediaDeletionIntent
      .updateMany({
        where: { objectKey: key, status: "RESERVED" },
        data: { status: "PENDING", availableAt: new Date(), claimedUntil: null },
      })
      .catch(() => undefined);
    throw error;
  }
}
export async function getAttachment(userId: string, id: string, attachmentId: string) {
  await readGate(userId, id);
  const file = await prisma.chat2Media.findFirst({
    where: { id: attachmentId, conversationId: id, status: "READY", messageId: { not: null } },
    include: { message: { select: { deletedAt: true } } },
  });
  if (!file || file.message?.deletedAt)
    return fail("ATTACHMENT_NOT_FOUND", 404, "Вложение не найдено");
  if(file.objectKey.startsWith("chat2-v2:")){
    const {readChat2V2Media}=await import("./media-v2-upload.js");
    return readChat2V2Media(userId,id,file.objectKey.slice("chat2-v2:".length));
  }
  return {
    url: await chat2SignedPrivateMedia(file.objectKey, file.kind === "video" ? 900 : 60),
    mime: file.mime,
    name: file.name,
    expiresIn: file.kind === "video" ? 900 : 60,
  };
}
export async function discardAttachment(userId: string, id: string, attachmentId: string) {
  await writeGate(userId, id);
  const file = await prisma.chat2Media.findFirst({
    where: {
      id: attachmentId,
      conversationId: id,
      ownerId: userId,
      messageId: null,
      status: "READY",
    },
  });
  if (!file) return fail("ATTACHMENT_NOT_FOUND", 404, "Вложение недоступно");
  if (file.status === "AVATAR") return fail("FORBIDDEN", 403, "Аватарку меняют в настройках группы");
  if(file.objectKey.startsWith("chat2-v2:")){
    const {discardChat2V2Media}=await import("./media-v2-upload.js");
    return discardChat2V2Media(userId,id,file.id,file.objectKey.slice("chat2-v2:".length));
  }
  await prisma.chat2Media.updateMany({
    where: { id: file.id, messageId: null, status: "READY" },
    data: { status: "REMOVING" },
  });
  await chat2DeletePrivateMedia(file.objectKey);
  await prisma.chat2Media.deleteMany({
    where: { id: file.id, messageId: null, status: "REMOVING" },
  });
  return { deleted: true };
}
/** Row lock serializes concurrent owner/admin avatar replacements and removal. */
async function lockedAvatar(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<{ avatarMediaId: string | null }[]>`
    SELECT "avatarMediaId" FROM "Chat2Conversation" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows.length) return fail("NOT_FOUND", 404, "Чат не найден");
  return rows[0]!.avatarMediaId;
}

export async function changeGroupAvatar(
  userId: string, id: string,
  file: { name: string; type: string; bytes: Uint8Array },
) {
  await groupAvatarActor(userId, id);
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.bytes.length < 10 || file.bytes.length > 5 * 1024 * 1024)
    return fail("INVALID_AVATAR", 400, "Выберите JPG, PNG или WebP до 5 МБ");
  let key: string;
  try { key = chat2ReservePrivateObjectKey(id, userId, file.bytes, file.type); }
  catch { return fail("INVALID_AVATAR", 400, "Файл не соответствует формату изображения"); }
  await prisma.chat2MediaDeletionIntent.create({
    data: { objectKey: key, status: "RESERVED", availableAt: new Date(Date.now() + 180_000) },
  });
  try {
    const stored = await chat2UploadPrivateImageOrPdf(id, userId, file.bytes, file.type, key);
    await groupAvatarActor(userId, id); // Permissions can change during an S3 upload.
    await prisma.$transaction(async (tx) => {
      const previous = await lockedAvatar(tx, id);
      const member = await tx.chat2Member.findUnique({
        where: { conversationId_userId: { conversationId: id, userId } },
        select: { role: true },
      });
      if (!member || !["OWNER", "ADMIN"].includes(member.role))
        return fail("FORBIDDEN", 403, "Нет прав на изменение группы");
      const record = await tx.chat2Media.create({
        data: { conversationId: id, ownerId: userId, objectKey: stored.objectKey,
          name: file.name.slice(0, 180) || "avatar", kind: "image", mime: stored.mime,
          bytes: stored.bytes, status: "AVATAR" },
      });
      await tx.chat2Conversation.update({ where: { id }, data: { avatarMediaId: record.id } });
      if (previous) await tx.chat2Media.deleteMany({
        where: { id: previous, conversationId: id, status: "AVATAR", messageId: null },
      });
    });
    await prisma.chat2MediaDeletionIntent.deleteMany({
      where: { objectKey: key, status: "RESERVED" },
    }).catch(() => undefined);
    return { avatarUrl: await roomAvatarUrl((await prisma.chat2Conversation.findUniqueOrThrow({
      where: { id }, select: { avatarMediaId: true },
    })).avatarMediaId) };
  } catch (error) {
    await prisma.chat2MediaDeletionIntent.updateMany({
      where: { objectKey: key, status: "RESERVED" },
      data: { status: "PENDING", availableAt: new Date(), claimedUntil: null },
    }).catch(() => undefined);
    throw error;
  }
}

export async function removeGroupAvatar(userId: string, id: string) {
  await groupAvatarActor(userId, id);
  await prisma.$transaction(async (tx) => {
    const previous = await lockedAvatar(tx, id);
    const member = await tx.chat2Member.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
      select: { role: true },
    });
    if (!member || !["OWNER", "ADMIN"].includes(member.role))
      return fail("FORBIDDEN", 403, "Нет прав на изменение группы");
    await tx.chat2Conversation.update({ where: { id }, data: { avatarMediaId: null } });
    if (previous) await tx.chat2Media.deleteMany({
      where: { id: previous, conversationId: id, status: "AVATAR", messageId: null },
    });
  });
  return { avatarUrl: null };
}

/** Group governance: the owner cannot be removed by a moderator. */
export async function updateGroup(
  userId: string,
  id: string,
  data: { name?: string; description?: string; visibility?: "PUBLIC" | "PRIVATE" | "UNLISTED" },
) {
  const actor = await readGate(userId, id);
  if (
    !["GROUP", "CITY", "BREED", "COURSE_TOPIC"].includes(actor.conversation.kind) ||
    !["OWNER", "ADMIN"].includes(actor.role)
  )
    return fail("FORBIDDEN", 403, "Нет прав на изменение группы");
  const changed = await prisma.chat2Conversation.update({ where: { id }, data });
  return {
    id: changed.id,
    name: changed.name,
    description: changed.description,
    visibility: changed.visibility,
  };
}
export async function moderateGroup(
  userId: string,
  id: string,
  targetId: string,
  action: "BAN" | "UNBAN" | "KICK" | "PROMOTE" | "DEMOTE",
) {
  const actor = await readGate(userId, id);
  if (
    !["GROUP", "CITY", "BREED", "COURSE_TOPIC"].includes(actor.conversation.kind) ||
    !["OWNER", "ADMIN"].includes(actor.role)
  )
    return fail("FORBIDDEN", 403, "Нет прав модератора");
  if (targetId === userId) return fail("FORBIDDEN", 403, "Нельзя менять свои права этим действием");
  const target = await prisma.chat2Member.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: targetId } },
  });
  if (!target) return fail("NOT_FOUND", 404, "Участник не найден");
  if (target.role === "OWNER" || (actor.role === "ADMIN" && target.role !== "MEMBER"))
    return fail("FORBIDDEN", 403, "Недостаточно прав для этого участника");
  if (action === "BAN" || action === "KICK") {
    await revokeLiveRoomSubscription(targetId, id);
  }
  if (action === "UNBAN") {
    if (target.role !== "BANNED") return fail("INVALID_STATE", 409, "Пользователь не исключён");
    await prisma.chat2Member.update({
      where: { id: target.id },
      data: { role: "MEMBER", hiddenAt: new Date() },
    });
  } else if (action === "BAN") {
    await prisma.chat2Member.update({
      where: { id: target.id },
      data: { role: "BANNED", hiddenAt: new Date() },
    });
  } else if (action === "KICK") {
    if (target.role === "BANNED") return fail("INVALID_STATE", 409, "Пользователь уже исключён");
    await prisma.chat2Member.delete({ where: { id: target.id } });
  } else if (action === "PROMOTE" && actor.role === "OWNER" && target.role === "MEMBER") {
    await prisma.chat2Member.update({ where: { id: target.id }, data: { role: "ADMIN" } });
  } else if (action === "DEMOTE" && actor.role === "OWNER" && target.role === "ADMIN") {
    await prisma.chat2Member.update({ where: { id: target.id }, data: { role: "MEMBER" } });
  } else return fail("INVALID_STATE", 409, "Действие недоступно");
  return { done: true };
}
export async function transferGroupOwner(userId: string, id: string, targetId: string) {
  const actor = await readGate(userId, id);
  if (!["GROUP", "CITY", "BREED", "COURSE_TOPIC"].includes(actor.conversation.kind) || actor.role !== "OWNER")
    return fail("FORBIDDEN", 403, "Только владелец может передать группу");
  if (targetId === userId) return fail("INVALID_STATE", 409, "Уже владелец");
  await prisma.$transaction(
    async (tx) => {
      const current = await tx.chat2Member.findUnique({
        where: { conversationId_userId: { conversationId: id, userId } },
      });
      const target = await tx.chat2Member.findUnique({
        where: { conversationId_userId: { conversationId: id, userId: targetId } },
      });
      if (current?.role !== "OWNER" || !target || target.role === "BANNED")
        return fail("FORBIDDEN", 403, "Передача недоступна");
      await tx.chat2Member.update({ where: { id: current.id }, data: { role: "ADMIN" } });
      await tx.chat2Member.update({ where: { id: target.id }, data: { role: "OWNER" } });
      await tx.chat2Conversation.update({ where: { id }, data: { createdById: targetId } });
    },
    { isolationLevel: "Serializable" },
  );
  return { ownerId: targetId };
}
export async function muteChat(userId: string, id: string, muted: boolean) {
  const actor = await readGate(userId, id);
  const mutedUntil = muted ? new Date("9999-12-31T00:00:00.000Z") : null;
  await prisma.chat2Member.update({ where: { id: actor.id }, data: { mutedUntil } });
  return { muted };
}

/** User reports are private, idempotent and visible only to authorized moderators. */
export async function reportChatMessage(
  userId: string,
  id: string,
  messageId: string,
  data: { reason: "SPAM" | "ABUSE" | "OTHER"; comment?: string },
) {
  await readGate(userId, id);
  const message = await prisma.chat2Message.findFirst({
    where: { id: messageId, conversationId: id, deletedAt: null },
    select: { authorId: true },
  });
  if (!message) return fail("NOT_FOUND", 404, "Сообщение недоступно");
  if (message.authorId === userId)
    return fail("SELF_REPORT", 400, "На своё сообщение нельзя пожаловаться");
  const report = await prisma.chat2Report.upsert({
    where: { reporterId_messageId: { reporterId: userId, messageId } },
    update: {},
    create: {
      conversationId: id,
      messageId,
      reporterId: userId,
      reason: data.reason,
      comment: data.comment ?? "",
    },
    select: { id: true },
  });
  return { reported: true, reportId: report.id };
}
export async function listChatReports(userId: string, id: string) {
  const member = await readGate(userId, id);
  if (
    !["GROUP", "CITY", "BREED", "COURSE_TOPIC", "COMMUNITY", "COURSE"].includes(member.conversation.kind) ||
    !["OWNER", "ADMIN"].includes(member.role)
  )
    return fail("FORBIDDEN", 403, "Нет прав на просмотр жалоб");
  if (member.conversation.kind === "COMMUNITY") {
    const staff = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (staff?.role !== "ADMIN" && staff?.role !== "MODERATOR")
      return fail("FORBIDDEN", 403, "Нет прав модератора общего чата");
  }
  const reports = await prisma.chat2Report.findMany({
    where: { conversationId: id, status: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      reason: true,
      comment: true,
      createdAt: true,
      message: { select: { id: true, authorId: true, text: true, deletedAt: true } },
    },
  });
  // Reporter identity remains private from the reported user and other members.
  return reports.map((item) => ({
    id: item.id,
    reason: item.reason,
    comment: item.comment,
    createdAt: item.createdAt.toISOString(),
    message: item.message,
  }));
}
export async function resolveChatReport(
  userId: string,
  id: string,
  reportId: string,
  status: "RESOLVED" | "REJECTED",
) {
  const member = await readGate(userId, id);
  if (
    !["GROUP", "CITY", "BREED", "COURSE_TOPIC", "COMMUNITY", "COURSE"].includes(member.conversation.kind) ||
    !["OWNER", "ADMIN"].includes(member.role)
  )
    return fail("FORBIDDEN", 403, "Нет прав модератора");
  if (member.conversation.kind === "COMMUNITY") {
    const staff = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (staff?.role !== "ADMIN" && staff?.role !== "MODERATOR")
      return fail("FORBIDDEN", 403, "Нет прав модератора общего чата");
  }
  const updated = await prisma.chat2Report.updateMany({
    where: { id: reportId, conversationId: id, status: "OPEN" },
    data: { status },
  });
  if (!updated.count) return fail("NOT_FOUND", 404, "Жалоба уже обработана или отсутствует");
  return { done: true };
}

/** Site-wide staff can review reports from DIRECT/CYNOLOGIST as well as groups.
 * Ordinary participants never see the reporter or another private conversation.
 */
async function requireChat2Staff(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== "ADMIN" && user?.role !== "MODERATOR")
    return fail("FORBIDDEN", 403, "Доступ только сотрудникам модерации");
}
export async function listStaffChatReports(userId: string) {
  await requireChat2Staff(userId);
  const reports = await prisma.chat2Report.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      reason: true,
      comment: true,
      createdAt: true,
      conversation: { select: { id: true, kind: true, name: true } },
      message: { select: { id: true, authorId: true, text: true, deletedAt: true } },
    },
  });
  return reports.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }));
}
export async function resolveStaffChatReport(
  userId: string,
  reportId: string,
  status: "RESOLVED" | "REJECTED",
) {
  await requireChat2Staff(userId);
  const changed = await prisma.chat2Report.updateMany({
    where: { id: reportId, status: "OPEN" },
    data: { status },
  });
  if (!changed.count) return fail("NOT_FOUND", 404, "Жалоба отсутствует или уже обработана");
  return { done: true };
}

/** Scoped chat discovery read. The HTTP layer owns validation and status;
 * application storage owns sensitive user selection and deletion filters.
 * The reserved cynologist is intentionally hidden from user discovery.
 */
export async function listCandidateChatUsers(actorId: string, query: string) {
  return prisma.user.findMany({
    where: {
      username: { contains: query, mode: "insensitive", not: "lana" },
      id: { not: actorId },
      accountDeletionRequestedAt: null,
    },
    select: { id: true, username: true },
    take: 15,
  });
}

export async function findChatUserIdByUsername(username: string): Promise<string | null> {
  const target = await prisma.user.findFirst({
    where: {
      username: { equals: username, mode: "insensitive" },
      accountDeletionRequestedAt: null,
    },
    select: { id: true },
  });
  return target?.id ?? null;
}
