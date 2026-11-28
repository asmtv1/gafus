import { getOutboxCorrelation, withCorrelatedUseCase } from "../../lib/operation-observability.js";
import type { createChatAccess } from "./access.js";
import { fail } from "./errors.js";
import { dto } from "./messageDto.js";
import { CHAT2_REACTION_EMOJIS, type Chat2ReactionEmoji } from "./reactionPolicy.js";

export function createChatMessageWrites(prisma: Pick<typeof import("@gafus/prisma").prisma, "$transaction" | "chat2Media" | "chat2Member" | "chat2Message" | "chat2V2MediaTask">, access: ReturnType<typeof createChatAccess>, Prisma: typeof import("@gafus/prisma").Prisma) {
  const { readGate, writeGate } = access;
  /** Redis is only a wake-up signal. PostgreSQL QUEUED or READY/due-360 is authoritative if
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
      where:{mediaId:{in:mediaIds},OR:[
        {status:"QUEUED"},
        {status:"READY",sourceMime:"video/mp4",nextAttemptAt:{lte:new Date()}},
      ]},
      select:{mediaId:true,sourceMime:true},
    });
    if(!tasks.length)return;
    const {enqueueChat2MediaProcessing}=await import("@gafus/queues");
    await Promise.allSettled(tasks.map(task=>enqueueChat2MediaProcessing(
      task.mediaId,task.sourceMime.startsWith("image/")?"photo":"video")));
  }

  async function sendMessage(
    userId: string,
    id: string,
    data: { clientMessageId: string; text: string; replyToId?: string; attachmentIds?: string[] },
  ) {
    await writeGate(userId, id);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const sent = await withCorrelatedUseCase("chat2.message.create.transaction", () => prisma.$transaction(
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
              attachmentIds.length > 10
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
                // READY 720p is attached immediately. Only NOW may its
                // background 360p Cloud Job run: never process abandoned drafts.
                await tx.chat2V2MediaTask.updateMany({
                  where:{mediaId:{in:v2Ids},conversationId:id,ownerId:userId,
                    status:"READY",sourceMime:"video/mp4"},
                  data:{nextAttemptAt:new Date(),attempts:0,errorCode:null},
                });
              }
            }
            await tx.chat2OutboxEvent.create({
              data: { conversationId: id, messageId: m.id, eventType: "message.created", ...getOutboxCorrelation() },
            });
            const full = await tx.chat2Message.findUniqueOrThrow({
              where: { id: m.id },
              include: { attachments: true },
            });
            return dto(full);
          },
          { isolationLevel: "Serializable" },
        ));
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

  async function editMessage(userId: string, id: string, messageId: string, text: string) {
    await writeGate(userId, id);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.chat2Message.updateMany({
        where: { id: messageId, conversationId: id, authorId: userId, deletedAt: null },
        data: { text, editedAt: new Date() },
      });
      if (!updated.count) return fail("NOT_FOUND", 404, "Сообщение не найдено");
      const message = await tx.chat2Message.findUniqueOrThrow({ where: { id: messageId } });
      await tx.chat2OutboxEvent.create({
        data: { conversationId: id, messageId, eventType: "message.edited", ...getOutboxCorrelation() },
      });
      return dto(message);
    });
  }

  async function deleteMessage(userId: string, id: string, messageId: string) {
    await writeGate(userId, id);
    return prisma.$transaction(async (tx) => {
      const changed = await tx.chat2Message.updateMany({
        where: { id: messageId, conversationId: id, authorId: userId, deletedAt: null },
        data: { text: "", deletedAt: new Date() },
      });
      if (!changed.count) return fail("NOT_FOUND", 404, "Сообщение не найдено");
      await tx.chat2OutboxEvent.create({
        data: { conversationId: id, messageId, eventType: "message.deleted", ...getOutboxCorrelation() },
      });
      return { deleted: true };
    });
  }

  /** A change is permanent and broadcast through the existing chat outbox. */
  async function toggleMessageReaction(
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
        data: { conversationId: id, messageId, eventType: "message.reacted", ...getOutboxCorrelation() },
      });
      return { messageId, emoji, active: existing?.emoji !== emoji };
    });
  }

  async function markRead(userId: string, id: string, sequence: bigint) {
    const m = await readGate(userId, id);
    const n = sequence > m.conversation.nextSequence ? m.conversation.nextSequence : sequence;
    await prisma.chat2Member.updateMany({
      where: { id: m.id, lastReadSequence: { lt: n } },
      data: { lastReadSequence: n, hiddenAt: null },
    });
    return { lastReadSequence: n.toString() };
  }

  return { sendMessage, editMessage, deleteMessage, toggleMessageReaction, markRead };
}
