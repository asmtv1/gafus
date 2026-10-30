/** Strict OFFLINE Stream-export importer for the isolated Refactor Chat2 database.
 * No Stream SDK/API, no main project, no production DB, and no replay push events.
 * Older snapshots must be inspected and mapped to this canonical schema explicitly.
 */
import { createHash } from "node:crypto";
import { prisma, Prisma } from "@gafus/prisma";
import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const archivedMessage = z
  .object({
    sourceId: identifier,
    authorId: identifier,
    text: z.string().max(8000),
    createdAt: z.string().datetime({ offset: true }),
    replyToSourceId: identifier.optional(),
  })
  .strict();
const direct = z
  .object({
    kind: z.literal("DIRECT"),
    sourceId: identifier,
    members: z.tuple([identifier, identifier]),
    messages: z.array(archivedMessage).max(100000),
  })
  .strict();
const cynologist = z
  .object({
    kind: z.literal("CYNOLOGIST"),
    sourceId: identifier,
    clientId: identifier,
    trainerId: identifier,
    messages: z.array(archivedMessage).max(100000),
  })
  .strict();
const community = z
  .object({
    kind: z.literal("COMMUNITY"),
    sourceId: identifier,
    members: z.array(identifier).min(1).max(100000),
    messages: z.array(archivedMessage).max(100000),
  })
  .strict();
export const archiveSchema = z
  .object({
    format: z.literal("gafus-chat2-archive-v1"),
    conversations: z
      .array(z.discriminatedUnion("kind", [direct, cynologist, community]))
      .max(100000),
  })
  .strict();
export type Chat2Archive = z.infer<typeof archiveSchema>;
type ArchiveRoom = Chat2Archive["conversations"][number];

export function importedClientMessageId(sourceChannel: string, sourceId: string) {
  const hash = createHash("sha256")
    .update(JSON.stringify(["gafus-chat2-archive-v1", sourceChannel, sourceId]))
    .digest("hex");
  // Consistent RFC-4122 variant UUID, derived only from the source room and message ID.
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
const memberIds = (c: ArchiveRoom) =>
  c.kind === "CYNOLOGIST" ? [c.clientId, c.trainerId] : c.members;
export function validateArchive(payload: unknown) {
  const archive = archiveSchema.parse(payload);
  let total = 0;
  const rooms = new Set<string>();
  for (const c of archive.conversations) {
    const members = memberIds(c);
    if (new Set(members).size !== members.length) throw new Error("DUPLICATE_ARCHIVE_MEMBER");
    if (c.kind === "DIRECT" && c.members[0] === c.members[1]) throw new Error("SELF_DIRECT_ROOM");
    const key = `${c.kind}:${c.kind === "DIRECT" ? [...c.members].sort().join(":") : c.kind === "CYNOLOGIST" ? c.clientId : "global"}`;
    if (rooms.has(key)) throw new Error("DUPLICATE_ARCHIVE_ROOM");
    rooms.add(key);
    const sources = new Set<string>();
    const sourceAuthors = new Set(members);
    for (const message of c.messages) {
      if (!sourceAuthors.has(message.authorId)) throw new Error("ARCHIVE_AUTHOR_NOT_MEMBER");
      if (sources.has(message.sourceId)) throw new Error("DUPLICATE_ARCHIVE_MESSAGE");
      if (!message.text.trim()) throw new Error("EMPTY_ARCHIVE_MESSAGE");
      sources.add(message.sourceId);
      total++;
      if (total > 100000) throw new Error("ARCHIVE_TOO_LARGE");
    }
    for (const message of c.messages) {
      if (message.replyToSourceId && !sources.has(message.replyToSourceId))
        throw new Error("MISSING_ARCHIVE_REPLY");
    }
  }
  return { archive, summary: { conversations: archive.conversations.length, messages: total } };
}

/** Only for the dedicated scratch PostgreSQL cluster, never any deployment DB. */
async function verifyIsolatedDestination() {
  const raw = process.env.DATABASE_URL;
  if (!raw || process.env.CHAT2_IMPORT_ISOLATED != "enabled") throw new Error("IMPORT_NOT_ENABLED");
  const u = new URL(raw);
  if (
    u.protocol !== "postgresql:" ||
    u.hostname !== "127.0.0.1" ||
    u.port !== "55432" ||
    u.pathname !== "/chat2_integration" ||
    u.username !== "chat2_dev"
  )
    throw new Error("IMPORT_DB_NOT_ISOLATED");
  const db = await prisma.$queryRawUnsafe<{ data_directory: string }[]>(
    "SELECT current_setting('data_directory') AS data_directory",
  );
  if (db[0]?.data_directory !== "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/chat2-db")
    throw new Error("IMPORT_DB_ROOT_MISMATCH");
}
export async function importArchiveIntoIsolatedDatabase(payload: unknown) {
  const { archive, summary } = validateArchive(payload);
  await verifyIsolatedDestination();
  const ids = new Set(archive.conversations.flatMap(memberIds));
  const actual = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true },
  });
  if (actual.length !== ids.size) throw new Error("ARCHIVE_USER_MAPPING_INCOMPLETE");
  let imported = 0,
    skipped = 0;
  for (const c of archive.conversations) {
    const roomKey = `${c.kind}:${c.sourceId}`;
    const properties =
      c.kind === "DIRECT"
        ? {
            kind: "DIRECT" as const,
            directKey: `dm:${[...c.members].sort().join(":")}`,
            createdById: c.members[0],
            visibility: "PRIVATE" as const,
          }
        : c.kind === "CYNOLOGIST"
          ? {
              kind: "CYNOLOGIST" as const,
              directKey: `cyno:${c.clientId}`,
              createdById: c.clientId,
              visibility: "PRIVATE" as const,
            }
          : {
              kind: "COMMUNITY" as const,
              scopeKey: "global",
              visibility: "PUBLIC" as const,
              name: "Общий чат GAFUS",
            };
    const room = await prisma.chat2Conversation.upsert({
      where:
        c.kind === "COMMUNITY"
          ? { kind_scopeKey: { kind: "COMMUNITY", scopeKey: "global" } }
          : { directKey: properties.directKey },
      update: {},
      create: properties,
    });
    for (const userId of memberIds(c)) {
      await prisma.chat2Member.upsert({
        where: { conversationId_userId: { conversationId: room.id, userId } },
        create: { conversationId: room.id, userId },
        update: {},
      });
    }
    const ordered = [...c.messages].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.sourceId.localeCompare(b.sourceId),
    );
    const resolved = new Map<string, string>();
    for (const message of ordered) {
      const key = importedClientMessageId(roomKey, message.sourceId);
      const [row, newlyImported] = await prisma.$transaction(
        async (tx) => {
          const where = {
            conversationId: room.id,
            authorId: message.authorId,
            clientMessageId: key,
          };
          const existing = await tx.chat2Message.findUnique({
            where: { conversationId_authorId_clientMessageId: where },
          });
          if (existing) {
            if (
              existing.text !== message.text ||
              existing.createdAt.toISOString() !== new Date(message.createdAt).toISOString()
            )
              throw new Error("ARCHIVE_MESSAGE_CONFLICT");
            return [existing, false] as const;
          }
          const pos = await tx.chat2Conversation.update({
            where: { id: room.id },
            data: { nextSequence: { increment: 1 } },
            select: { nextSequence: true },
          });
          const created = await tx.chat2Message.create({
            data: {
              conversationId: room.id,
              authorId: message.authorId,
              clientMessageId: key,
              sequence: pos.nextSequence,
              text: message.text,
              createdAt: new Date(message.createdAt),
            },
          });
          // Historic messages intentionally have no outbox entry: no old push storm.
          return [created, true] as const;
        },
        { isolationLevel: "Serializable" },
      );
      resolved.set(message.sourceId, row.id);
      if (newlyImported) imported++;
      else skipped++;
    }
    // Replies are linked in a second pass, including backward-compatible
    // exports where message timestamps are equal or inconsistent.
    for (const message of ordered) {
      if (!message.replyToSourceId) continue;
      const id = resolved.get(message.sourceId),
        replyId = resolved.get(message.replyToSourceId);
      if (!id || !replyId) throw new Error("ARCHIVE_REPLY_LINK_NOT_FOUND");
      const record = await prisma.chat2Message.findUniqueOrThrow({
        where: { id },
        select: { replyToId: true },
      });
      if (record.replyToId && record.replyToId !== replyId)
        throw new Error("ARCHIVE_REPLY_CONFLICT");
      if (!record.replyToId)
        await prisma.chat2Message.update({ where: { id }, data: { replyToId: replyId } });
    }
  }
  return { ...summary, imported, skipped };
}
