/** Pure Chat2 message wire contract: no Prisma, S3, JWT or network.
 * Preserve read/write facade imports while separating transport projection
 * from room permissions and transactional persistence.
 */
export const dto = (m: {
  id: string;
  conversationId: string;
  sequence: bigint;
  authorId: string;
  clientMessageId: string;
  text: string;
  replyToId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  attachments?: {
    id: string;
    kind: string;
    mime: string;
    name: string;
    bytes: number;
    status: string;
  }[];
}) => ({
  id: m.id,
  conversationId: m.conversationId,
  sequence: m.sequence.toString(),
  authorId: m.authorId,
  clientMessageId: m.clientMessageId,
  text: m.deletedAt ? "" : m.text,
  replyToId: m.replyToId,
  createdAt: m.createdAt.toISOString(),
  editedAt: m.editedAt?.toISOString() ?? null,
  deletedAt: m.deletedAt?.toISOString() ?? null,
  attachments: m.deletedAt
    ? []
    : (m.attachments ?? [])
        .filter((x) => x.status === "READY")
        .map((x) => ({ id: x.id, kind: x.kind, mime: x.mime, name: x.name, bytes: x.bytes })),
});
