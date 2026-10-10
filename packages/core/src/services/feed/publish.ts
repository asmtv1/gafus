import type { FeedTx } from "./ports";
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
