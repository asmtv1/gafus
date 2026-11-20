/** One logical send attempt on web, iOS and Android.
 * A returned ID remains reserved after an ambiguous server/transport failure;
 * callers discard it ONLY after a confirmed successful send. */
export type ChatSendDraft = {
  actorId: string;
  conversationId: string;
  text: string;
  replyToId?: string | null;
  attachmentIds: readonly string[];
};
export type ChatSendAttempt = {
  draft: ChatSendDraft;
  clientMessageId: string;
};

function identical(a: ChatSendDraft, b: ChatSendDraft): boolean {
  return a.actorId === b.actorId &&
    a.conversationId === b.conversationId &&
    a.text === b.text &&
    (a.replyToId ?? null) === (b.replyToId ?? null) &&
    a.attachmentIds.length === b.attachmentIds.length &&
    // Attachment ordering is significant to the server's message presentation.
    a.attachmentIds.every((id, index) => id === b.attachmentIds[index]);
}

export function reserveChatSendAttempt(
  previous: ChatSendAttempt | null,
  draft: ChatSendDraft,
  generateId: () => string,
): ChatSendAttempt {
  if (previous && identical(previous.draft, draft)) return previous;
  // Clone the attachment array: a mutable composer cannot change a reserved ID's fingerprint.
  return { clientMessageId: generateId(), draft: { ...draft, attachmentIds: [...draft.attachmentIds] } };
}
