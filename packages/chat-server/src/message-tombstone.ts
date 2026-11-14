import { prisma } from "@gafus/prisma";
import type { ChatMessageDeletionPort } from "./messageManagement.js";

/** Durably suppresses resend before hard-deleting a Stream message. */
export const persistChatMessageDeletion: ChatMessageDeletionPort = async ({ userId, messageId, community }) => {
  const tombstone = {
    where: { streamMessageId: messageId, senderUserId: userId },
    data: { state: "DELETED" as const },
  };
  if (community) await prisma.communityChatSendOperation.updateMany(tombstone);
  else await prisma.chatSendOperation.updateMany(tombstone);
};
