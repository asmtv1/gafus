# Feed poll API contract — required before enabling the feature

The database migration is **schema-only**: it does not publish polls or expose voting endpoints. Future Feed services must enforce these invariants within the same transaction as each mutation:

- **Media ownership and post isolation:** every `FeedPollOption.imageMediaId` must belong to the same `FeedPost` as its `FeedPoll.postId`, to the authenticated author (`FeedMediaAsset.ownerId`), and have `kind=photo` and `status=ready` before publication. Do not expose unrelated assets using this foreign key. Integrate image attachments into the existing Feed revision, signed-CDN-access and cleanup lifecycle.
- **Revision isolation:** saving an unpublished revision must not change a currently published poll. Coordinate creation, edits and activation with `FeedPostRevision`, `FeedPost.activeRevisionId` and version/idempotency checks; do not permit changes that corrupt existing votes.
- **Soft deletion and moderation:** creating, publishing, viewing, voting on and aggregating a poll must respect `FeedPost.deletedAt IS NULL`, `status=published` where appropriate, and `moderationState=visible` for non-authors. A physical FK cascade does **not** enforce soft deletion.
- **Voting:** require an authenticated actor; reject expired/closed polls; validate option count and membership and `allowMultiple`; serialize concurrent submissions; respect the unique `(pollId,userId)` vote key; define the explicit policy for editing/retracting a vote. The database cannot enforce single-selection or closure on its own.
- **Privacy:** `isAnonymous` must suppress voter identities in public responses, logs and analytics. `hideResults` must prevent early access to aggregates; quiz correctness and explanation must not leak before policy permits them.
- **Authorization and limits:** only the post owner can create or change the poll; validate text/media sizes, option count, quiz correct choices, poll end times and idempotency before writes. Apply author moderation and existing Feed permissions.

Schema smoke tests live in `feed-polls-migration.sql`; they deliberately exercise FK/cascade behavior, not application-level authorization. API integration/security tests are in `packages/core/src/services/feed/polls.integration.test.ts` and the Feed HTTP/UX suites.

## Release safety (no separate poll flag)

Polls are a built-in part of Feed and follow the existing Feed service
availability checks. There is no separate poll feature switch: Web, API and
background workers must be deployed together **after the additive migration**.
Both immediate publication and asynchronous activation validate ready poll
option photos; clients cannot bypass these checks.

Poll-only posts, batched `hasPoll` Feed DTO hydration, background publication
queue, Web/Mobile editors and inline voting cards work together. Web and
Mobile allow dedicated image uploads for individual poll options: files stay
outside the main gallery. Publishing waits for processing, and retry uses the
same upload IDs to avoid duplicates. Older Mobile versions render «Опрос» for
poll-only posts, rather than an empty card.

No staging server is configured. Local tests simulate S3/Cloud.ru; real media
and CDN validation require an authorized release. The production deployment
runbook is `docs/features/feed-polls-release.md`.
