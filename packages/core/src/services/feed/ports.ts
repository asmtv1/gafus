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
  /** Feature-gated phone-encoded images, no Cloud.ru photo Job. */
  signClientRenditions?(input: { sourceKey: string; expiresAt: Date }): Promise<{
    small: { url: string; fields: Record<string, string> };
    medium: { url: string; fields: Record<string, string> };
  }>;
  publishClientPhoto?(input: { sourceKey: string; smallKey: string; thumbKey: string;
    fullKey: string }): Promise<{ width: number; height: number }>;
  /** Signed private WebP frame, pre-encoded by browser/iOS/Android. */
  signClientVideoPoster?(input:{sourceKey:string;expiresAt:Date}):Promise<{
    url:string;fields:Record<string,string>;
  }>;
  /** After authenticated S3 validation, copy both H264 720p + ONE WebP poster. */
  publishClientVideo?(input:{sourceKey:string;finalKey:string;posterKey:string;bytes:number}):Promise<{
    width:number;height:number;durationSeconds:number;
  }>;
  /** S3-side cross-bucket COPY of already encoded gallery WebP; no image Job. */
  copyGalleryPhotoVariants?(input: {
    ownerId: string; albumId: string; photoId: string; mediaId: string;
    thumbKey: string; fullKey: string;
  }): Promise<{ width: number; height: number }>;
  head(key: string): Promise<{ etag: string; bytes: number; contentType: string } | null>;
  signCdn(input: { key: string; expiresAt: Date }): Promise<string>;
}
