/**
 * Infrastructure-owned typed persistence contracts for the existing injected
 * Feed and Gallery Prisma implementations. Core depends on these port shapes,
 * not on Prisma runtime. A future fully ORM-agnostic port narrowing remains open.
 */
import type { Prisma, PrismaClient } from "@gafus/prisma";
export type FeedDb = Pick<
  PrismaClient,
  | "$transaction"
  | "$queryRaw"
  | "user"
  | "feedPost"
  | "feedPostRevision"
  | "feedMediaAsset"
  | "feedUpload"
  | "feedRevisionAttachment"
  | "galleryPhoto"
  | "feedStorageJob"
  | "feedComment"
  | "feedCommentMedia"
  | "feedPostReaction"
  | "feedCommentReaction"
  | "feedPostView"
  | "feedNotification"
  | "feedNotificationOutbox"
  | "feedBookmark"
  | "feedAuthorPreference"
  | "feedReport"
  | "feedModerationAction"
  | "feedPersonalizationPreference"
  | "feedImpression"
  | "feedUserAuthorAffinity"
  | "feedPostStats"
  | "feedUserPostFeedback"
  | "feedSmartRankerModel"
  | "feedRankingEvent"
  | "feedPoll"
  | "feedPollOption"
  | "feedPollVote"
  | "feedPollVoteSelection"
>;
export type FeedTx = Prisma.TransactionClient;

export type GalleryDb = Pick<
  PrismaClient,
  "$transaction" | "user" | "galleryAlbum" | "galleryPhoto" | "galleryUpload" | "galleryStorageJob"
>;
export type GalleryTx = Prisma.TransactionClient;

export const FEED_AUTHOR_SELECT = {
  id: true,
  username: true,
  role: true,
  profile: { select: { fullName: true, avatarUrl: true } },
} as const;
export const FEED_POST_INCLUDE = {
  author: { select: FEED_AUTHOR_SELECT },
} as const;
export type FeedPostRow = Prisma.FeedPostGetPayload<{ include: typeof FEED_POST_INCLUDE }>;
export type FeedAssetRow = Prisma.FeedMediaAssetGetPayload<Record<string, never>>;
export type FeedPostWhere = Prisma.FeedPostWhereInput;
export type GalleryAlbumRow = Prisma.GalleryAlbumGetPayload<{
  include: { owner: { select: { username: true } } };
}>;
export type GalleryPhotoRow = Prisma.GalleryPhotoGetPayload<Record<string, never>>;
export type GalleryUploadRow = Prisma.GalleryUploadGetPayload<{ include: { photo: true } }>;
export type GalleryJobRow = Prisma.GalleryStorageJobGetPayload<Record<string, never>>;
export type GalleryPhotoWhere = Prisma.GalleryPhotoWhereInput;
