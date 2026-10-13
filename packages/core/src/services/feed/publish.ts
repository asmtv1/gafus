import type { FeedTx } from "./ports";
import { FeedError } from "./errors";
import { enqueueFeedAuthorPush } from "./preferences";
import { registerGafusPostPublicationTx } from "../gafus/reactionRewardService";

/**
 * The only place that transitions a ready feed revision into published state.
 * Both immediate and async-media publication MUST call this within their own transaction.
 */
export async function activateFeedPostRevisionTx(
  tx: FeedTx,
  input: {
    post: { id: string; authorId: string; publishedAt: Date | null };
    revisionId: string;
    text: string;
    publishedMediaCount: number;
    at: Date;
  },
): Promise<void> {
  const { post, revisionId, at } = input;
  // Polls are a first-class part of Feed, with no independent rollout flag.
  // Validate option media on every activation (immediate or via worker).
  const poll = await tx.feedPoll.findUnique({
    where: { postId: post.id },
    include: { options: { where: { imageMediaId: { not: null } }, include: { imageMedia: true } } },
  });
  if (input.publishedMediaCount === 0 && !input.text.trim() && !poll) {
    throw new FeedError("EMPTY_POST", undefined, 400);
  }
  if (poll?.options.some(option => !option.imageMedia ||
      option.imageMedia.postId !== post.id ||
      option.imageMedia.ownerId !== post.authorId || option.imageMedia.kind !== "photo" ||
      option.imageMedia.status !== "ready" ||
      !option.imageMedia.thumbKey || !option.imageMedia.fullKey)) {
    throw new FeedError("VALIDATION_ERROR", "Изображение варианта опроса недоступно", 400);
  }
  await tx.feedPostRevision.update({ where: { id: revisionId }, data: { status: "ready" } });
  await tx.feedPost.update({
    where: { id: post.id },
    data: {
      activeRevisionId: revisionId,
      status: "published",
      publishedAt: post.publishedAt ?? at,
      editedAt: post.publishedAt ? at : null,
    },
  });
  if (!post.publishedAt) {
    await registerGafusPostPublicationTx(tx, post, {
      publishedAt: at,
      text: input.text,
      hasPublishedMedia: input.publishedMediaCount > 0,
    });
  }
  await enqueueFeedAuthorPush(tx, post, at);
}
