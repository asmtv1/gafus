/** Chat2 membership/moderation commands and stable route-facing exports. */
import { prisma, Prisma } from "@gafus/prisma";
import { subscriptionAccessPort } from "../app-subscription/composition/subscription-access-instance.js";
import { getCynologistEntitlements } from "@gafus/core/services/appSubscription";
import { allowedCourseIds } from "../content-access/composition/content-policy-instance.js";
import { revokeLiveRoomSubscription } from "./revocation.js";
import { fail } from "./errors.js";
import { createChatAccess, reservedCynologist, isCynologistUsername } from "./access.js";
import { createChatAvatars } from "./avatars.js";
import { createChatReads } from "./reads.js";
import { createChatMessageWrites } from "./messageWrites.js";
import { createChatAttachmentWrites } from "./attachmentWrites.js";

// Keep the original, already-approved Chat2 persistence boundary here.
// Factories only receive the delegates required by their operation.
const access = createChatAccess(prisma);
const avatars = createChatAvatars(prisma);
const { alignCynologistMembers, ensureCommunityMembership } = access;
export const { readGate, writeGate } = access;
export const { chat2MemberAvatarUrl } = avatars;
export const { listChats, accessibleCourseRooms, discover, chatDetails, messages } = createChatReads(prisma, access, avatars);
export const { sendMessage, editMessage, deleteMessage, toggleMessageReaction, markRead } = createChatMessageWrites(prisma, access, Prisma);
export const { uploadAttachment, getAttachment, discardAttachment, changeGroupAvatar, removeGroupAvatar } = createChatAttachmentWrites(prisma, access, avatars);

export { Chat2Error } from "./errors.js";
export { dto } from "./messageDto.js";
export { CHAT2_REACTION_EMOJIS } from "./reactionPolicy.js";

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

export async function openCynologist(userId: string) {
  if (!(await getCynologistEntitlements(userId, undefined, subscriptionAccessPort)).canUseCynologistChat)
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

/** Explicit entry point retained for Mobile and rejoining after an opt-out. */
export async function openCommunity(userId: string) {
  const conversationId = await ensureCommunityMembership(userId, true);
  return { conversationId: conversationId! };
}

/** Course rooms use the existing central course entitlement policy and a single course-scoped conversation. */
export async function openCourse(userId: string, courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, name: true, authorId: true, isPrivate: true, isPaid: true,
      access: { where: { userId }, select: { userId: true } } },
  });
  if (!course) return fail("COURSE_NOT_FOUND", 404, "Курс не найден");
  if (course.authorId !== userId && !(await allowedCourseIds([course], userId)).has(course.id))
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
    // Persist the block FIRST. Any reconnect racing the broker unsubscribe
    // must encounter a committed readGate denial, never the old room grant.
    await prisma.chat2Block.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: otherId } },
      update: {},
      create: { blockerId: userId, blockedId: otherId },
    });
    if (room) {
      await Promise.all([
        revokeLiveRoomSubscription(userId, room.id),
        revokeLiveRoomSubscription(otherId, room.id),
      ]);
    }
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
  // A broker revoke before committing BAN creates a race: the client can
  // reconnect in the gap. Commit the ban/kick first, then revoke the socket.
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
  if (action === "BAN" || action === "KICK") {
    // After this committed write, readGate denies all new subscriptions.
    // Existing live sockets are explicitly revoked through private broker API.
    await revokeLiveRoomSubscription(targetId, id);
  }
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
