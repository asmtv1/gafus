import type { Prisma } from "@gafus/prisma";
import { chat2ReservePrivateObjectKey, chat2UploadPrivateImageOrPdf, chat2SignedPrivateMedia, chat2DeletePrivateMedia } from "@gafus/cdn-upload";
import type { createChatAccess } from "./access.js";
import type { createChatAvatars } from "./avatars.js";
import { fail } from "./errors.js";

export function createChatAttachmentWrites(prisma: Pick<typeof import("@gafus/prisma").prisma, "$transaction" | "chat2Conversation" | "chat2Media" | "chat2MediaDeletionIntent">, access: ReturnType<typeof createChatAccess>, avatars: ReturnType<typeof createChatAvatars>) {
  const { readGate, writeGate } = access;
  const { roomAvatarUrl } = avatars;
  const groupKinds = ["GROUP", "CITY", "BREED", "COURSE_TOPIC"] as const;

  async function groupAvatarActor(userId: string, id: string) {
    const actor = await readGate(userId, id);
    if (!groupKinds.some((kind) => kind === actor.conversation.kind) ||
        !["OWNER", "ADMIN"].includes(actor.role))
      return fail("FORBIDDEN", 403, "Нет прав на изменение аватарки группы");
    return actor;
  }

  /** Authenticated, scoped, fail-closed private media. No CDN/public URL is stored. */
  async function uploadAttachment(
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

  async function getAttachment(userId: string, id: string, attachmentId: string) {
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

  async function discardAttachment(userId: string, id: string, attachmentId: string) {
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

  async function changeGroupAvatar(
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

  async function removeGroupAvatar(userId: string, id: string) {
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

  return { uploadAttachment, getAttachment, discardAttachment, changeGroupAvatar, removeGroupAvatar };
}
