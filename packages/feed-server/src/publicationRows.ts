import type { FeedTx } from "@gafus/media-shared/media-db-ports";
import { assertRevisionCanPublish } from "@gafus/core/services/feed";
import type { GafusTx } from "@gafus/core/services/gafus";
import { registerGafusPostPublicationTx } from "./gafus-reward-instance.js";
import { enqueueFeedAuthorPush } from "./preferenceRows.js";

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
  assertRevisionCanPublish(input, poll);
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
    await registerGafusPostPublicationTx(tx as unknown as GafusTx, post, {
      publishedAt: at,
      text: input.text,
      hasPublishedMedia: input.publishedMediaCount > 0,
    });
  }
  await enqueueFeedAuthorPush(tx, post, at);
}
