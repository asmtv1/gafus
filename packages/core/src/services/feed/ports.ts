import type { Prisma, PrismaClient } from "@gafus/prisma";
export type FeedDb = Pick<
  PrismaClient,
  "$transaction" | "$queryRaw" | "user" | "feedPost" | "feedPostRevision" | "feedMediaAsset" |
  "feedUpload" | "feedRevisionAttachment" | "galleryPhoto" | "feedStorageJob" |
  "feedComment" | "feedCommentMedia" | "feedPostReaction" | "feedCommentReaction" | "feedPostView" |
  "feedNotification" | "feedNotificationOutbox" | "feedBookmark" | "feedAuthorPreference" | "feedReport" | "feedModerationAction" |
  "feedPersonalizationPreference" | "feedImpression" | "feedUserAuthorAffinity" | "feedPostStats" | "feedUserPostFeedback" |
  "feedSmartRankerModel" | "feedRankingEvent" | "feedPoll" | "feedPollOption" |
  "feedPollVote" | "feedPollVoteSelection"
>;
export type FeedTx = Prisma.TransactionClient;
export interface FeedStoragePort {
  enabled: boolean;
  /** Set only for verified public 24h Beget delivery with durable purge. */
  longLivedUrls?: boolean;
  presignPost(input: { key: string; contentType: string; maxBytes: number; expiresAt: Date }): Promise<{ url: string; fields: Record<string, string> }>;
  head(key: string): Promise<{ etag: string; bytes: number; contentType: string } | null>;
  signCdn(input: { key: string; expiresAt: Date }): Promise<string>;
}
