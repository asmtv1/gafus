import {
  FEED_LIMITS as L,
  type FeedCommentDto,
  type FeedMediaDto,
  type FeedReaction,
  type FeedReactionCountDto,
} from "@gafus/types";
import { stableMediaExpiry, stablePublicFeedExpiry } from "../mediaDelivery/signedExpiry";
import { signFeedMediaUrls, type FeedMediaUrlKeys } from "./media-urls";
import type { FeedStoragePort } from "./ports";
import { FeedError } from "./errors";
import * as s from "./schemas";

export const kindToReaction = {
  heart: "❤️",
  laugh: "😂",
  dog: "🐶",
  fire: "🔥",
  like: "👍",
} as const;
/** Projection consumed by the comment presentation policy; no generated ORM types. */
export type CommentRow = {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  moderationState: string;
  rootId: string | null;
  replyToId: string | null;
  author: {
    id: string;
    username: string;
    profile: { fullName: string | null; avatarUrl: string | null } | null;
  };
};

export function feedPersonDto(user: CommentRow["author"]) {
  return {
    id: user.id,
    username: user.username,
    name: user.profile?.fullName ?? user.username,
    avatarUrl: user.profile?.avatarUrl ?? null,
  };
}
export function encodeFeedSocialCursor(row: { id: string; createdAt: Date }) {
  return Buffer.from(JSON.stringify([row.createdAt.toISOString(), row.id])).toString("base64url");
}
export function decodeFeedSocialCursor(raw?: string | null) {
  if (!raw) return null;
  try {
    const pair = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown[];
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== "string" ||
      typeof pair[1] !== "string" ||
      !s.feedIdSchema.safeParse(pair[1]).success ||
      Number.isNaN(Date.parse(pair[0]))
    )
      throw Error("invalid");
    return { createdAt: new Date(pair[0]), id: pair[1] };
  } catch {
    throw new FeedError("VALIDATION_ERROR", "Некорректный курсор", 400);
  }
}
export interface FeedCommentReadOperations {
  readCommentActivity(
    actorId: string,
    ids: string[],
    addressedIds: string[],
  ): Promise<{
    counts: { commentId: string; kind: keyof typeof kindToReaction; count: number }[];
    mine: { commentId: string; kind: keyof typeof kindToReaction }[];
    replies: { rootId: string | null; count: number }[];
    addressed: Pick<CommentRow, "id" | "author">[];
  }>;
  readCommentMedia(ids: string[]): Promise<
    Array<{
      commentId: string;
      position: number;
      media: FeedMediaUrlKeys &
        Pick<FeedMediaDto, "status" | "width" | "height" | "durationSeconds">;
    }>
  >;
}

export function createFeedCommentRenderer(
  rowsPort: FeedCommentReadOperations,
  now: () => Date,
  storage?: Pick<FeedStoragePort, "signCdn" | "longLivedUrls">,
) {
  return async function commentDto(
    actorId: string,
    rows: CommentRow[],
    postAuthorId: string,
  ): Promise<FeedCommentDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const { counts, mine, replies, addressed } = await rowsPort.readCommentActivity(
      actorId,
      ids,
      rows.map((row) => row.replyToId).filter((id): id is string => !!id),
    );
    const reactions = new Map<string, FeedReactionCountDto[]>();
    for (const item of counts)
      reactions.set(item.commentId, [
        ...(reactions.get(item.commentId) ?? []),
        { emoji: kindToReaction[item.kind], count: item.count },
      ]);
    const my = new Map(mine.map((item) => [item.commentId, kindToReaction[item.kind]]));
    const replyCounts = new Map(replies.map((item) => [item.rootId, item.count]));
    const recipients = new Map(
      addressed.map((item) => [item.id, item.author.profile?.fullName ?? item.author.username]),
    );
    const at = now();
    const expires =
      storage?.longLivedUrls === true
        ? stablePublicFeedExpiry(at)
        : stableMediaExpiry(at, L.mediaUrlSeconds);
    const mediaRows = await rowsPort.readCommentMedia(ids);
    const signedMedia = new Map<string, NonNullable<FeedCommentDto["media"]>>();
    await Promise.all(
      mediaRows.map(async (item) => {
        const asset = item.media;
        const signed =
          storage && asset.status === "ready"
            ? await signFeedMediaUrls(asset, (key) => storage.signCdn({ key, expiresAt: expires }))
            : { smallUrl: null, thumbUrl: null, fullUrl: null, posterUrl: null, mp4Urls: null };
        const list = signedMedia.get(item.commentId) ?? [];
        list.push({
          id: asset.id,
          kind: asset.kind,
          position: item.position,
          status: asset.status,
          width: asset.width,
          height: asset.height,
          durationSeconds: asset.durationSeconds,
          ...signed,
          urlsExpireAt: asset.status === "ready" && storage ? expires.toISOString() : null,
        });
        signedMedia.set(item.commentId, list);
      }),
    );
    for (const list of signedMedia.values()) list.sort((a, b) => a.position - b.position);
    return rows.map((row) => ({
      id: row.id,
      postId: row.postId,
      author: feedPersonDto(row.author),
      media:
        row.deletedAt || row.moderationState !== "visible" ? [] : (signedMedia.get(row.id) ?? []),
      text: row.deletedAt || row.moderationState !== "visible" ? "" : row.text,
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
      editUntil: new Date(row.createdAt.getTime() + L.editSeconds * 1000).toISOString(),
      rootId: row.rootId,
      replyToId: row.replyToId,
      replyToName: row.replyToId ? (recipients.get(row.replyToId) ?? null) : null,
      deleted: !!row.deletedAt || row.moderationState !== "visible",
      moderationState: row.moderationState,
      replyCount: replyCounts.get(row.id) ?? 0,
      reactions: reactions.get(row.id) ?? [],
      myReaction: my.get(row.id) ?? null,
      canEdit:
        !row.deletedAt &&
        row.moderationState === "visible" &&
        row.authorId === actorId &&
        row.createdAt.getTime() + L.editSeconds * 1000 > at.getTime(),
      canDelete:
        !row.deletedAt &&
        row.moderationState === "visible" &&
        (row.authorId === actorId || postAuthorId === actorId),
    }));
  };
}

export function assertFeedCommentEditable(
  comment: { authorId: string; createdAt: Date },
  actorId: string,
  now: () => Date,
) {
  if (comment.authorId !== actorId) throw new FeedError("FORBIDDEN", undefined, 403);
  if (now().getTime() >= comment.createdAt.getTime() + L.editSeconds * 1000)
    throw new FeedError("EDIT_WINDOW_CLOSED", undefined, 409);
}

export function assertFeedCommentRemovable(
  authorId: string,
  postAuthorId: string,
  actorId: string,
) {
  if (authorId !== actorId && postAuthorId !== actorId)
    throw new FeedError("FORBIDDEN", undefined, 403);
}

export type FeedReactionKind = keyof typeof kindToReaction;
export const feedReactionToKind: Record<FeedReaction, FeedReactionKind> = {
  "❤️": "heart",
  "😂": "laugh",
  "🐶": "dog",
  "🔥": "fire",
  "👍": "like",
};

export interface FeedReactionCommands {
  setPostReaction(actorId: string, postId: string, kind: FeedReactionKind): Promise<void>;
  removePostReaction(actorId: string, postId: string): Promise<void>;
  setCommentReaction(actorId: string, commentId: string, kind: FeedReactionKind): Promise<void>;
  removeCommentReaction(actorId: string, commentId: string): Promise<void>;
}

export function createFeedReactionCommands(
  commands: FeedReactionCommands,
  assertActor: (actorId: string) => Promise<void>,
) {
  return {
    async setPostReaction(actorId: string, postId: string, reaction: FeedReaction) {
      await assertActor(actorId);
      const { reaction: emoji } = s.feedParse(s.feedReactionSchema, { reaction });
      await commands.setPostReaction(actorId, postId, feedReactionToKind[emoji]);
      return { reaction: emoji };
    },
    async removePostReaction(actorId: string, postId: string) {
      await assertActor(actorId);
      await commands.removePostReaction(actorId, postId);
      return { reaction: null };
    },
    async setCommentReaction(actorId: string, commentId: string, reaction: FeedReaction) {
      await assertActor(actorId);
      const { reaction: emoji } = s.feedParse(s.feedReactionSchema, { reaction });
      await commands.setCommentReaction(actorId, commentId, feedReactionToKind[emoji]);
      return { reaction: emoji };
    },
    async removeCommentReaction(actorId: string, commentId: string) {
      await assertActor(actorId);
      await commands.removeCommentReaction(actorId, commentId);
      return { reaction: null };
    },
  };
}
