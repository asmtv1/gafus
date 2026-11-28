import { isCynologistUsername, reservedCynologist, type createChatAccess } from "./access.js";
import type { createChatAvatars } from "./avatars.js";
import { fail } from "./errors.js";
import { collectBlockedDirectPeerIds, collectDirectInboxPeerIds } from "./inboxVisibility.js";
import { dto } from "./messageDto.js";
import { CHAT2_REACTION_EMOJIS } from "./reactionPolicy.js";

export function createChatReads(prisma: Pick<typeof import("@gafus/prisma").prisma, "chat2Block" | "chat2Conversation" | "chat2Member" | "chat2Message" | "chat2MessageReaction" | "user">, access: ReturnType<typeof createChatAccess>, avatars: ReturnType<typeof createChatAvatars>) {
  const { readGate, readChatCourses, ensureCommunityMembership, alignCynologistMembers } = access;
  const { roomAvatarUrl, roomAvatarUrls, chat2MemberAvatarUrl } = avatars;
  async function listChats(userId: string) {
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
    const courseIds = [...new Set(ms.flatMap(({ conversation }) =>
      conversation.kind === "COURSE" && conversation.scopeKey ? [conversation.scopeKey] : []))];
    const courseRooms = courseIds.length ? await readChatCourses(userId, courseIds) : [];
    const visibleCourseIds = new Set(courseRooms.map(course => course.id));
    const visible = ms.filter(m => {
        if (m.conversation.kind === "CYNOLOGIST")
          return m.conversation.createdById === userId || isSpecialist;
        if (m.conversation.kind === "COURSE")
          return !!m.conversation.scopeKey && visibleCourseIds.has(m.conversation.scopeKey);
        if (m.conversation.kind === "DIRECT") {
          // Hide any pre-existing private lane: no active alternative to paid access.
          if (m.conversation.members.some((x) => isCynologistUsername(x.user.username))) return false;
          const other = m.conversation.members.find((other) => other.userId !== userId);
          if (other && blockedDirectPeers.has(other.userId)) return false;
        }
        return true;
    });
    const avatars = await roomAvatarUrls(visible.map(m => m.conversation.avatarMediaId));
    return Promise.all(visible
      .map(async (m) => ({
        id: m.conversation.id,
        kind: m.conversation.kind,
        name: m.conversation.name,
        description: m.conversation.description,
        avatarUrl: avatars.get(m.conversation.avatarMediaId ?? "") ?? null,
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

  /** Only list courses this exact actor could currently open.
   * Privacy filtering and expensive entitlement checks always run on the server. */
  async function accessibleCourseRooms(userId: string) {
    const courses = await readChatCourses(userId);
    return courses.map(({ id, name }) => ({ id, name }));
  }

  async function discover(userId: string, search?: string) {
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
    const avatars = await roomAvatarUrls(cs.map(c => c.avatarMediaId));
    return cs.map(c => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      description: c.description,
      avatarUrl: avatars.get(c.avatarMediaId ?? "") ?? null,
      memberCount: c._count.members,
      joined: c.members.length > 0,
    }));
  }

  async function chatDetails(userId: string, id: string) {
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

  async function messages(userId: string, id: string, before?: bigint, after?: bigint) {
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

  return { listChats, accessibleCourseRooms, discover, chatDetails, messages };
}
