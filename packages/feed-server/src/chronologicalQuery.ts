import type { FeedChronologicalRowsPort } from "@gafus/core/services/feed";
import type { FeedDb } from "@gafus/media-shared/media-db-ports";

export const createChronologicalFeedReader =
  (db: Pick<FeedDb, "feedPost">): FeedChronologicalRowsPort =>
  async ({ actorId, bookmarksOnly, cursor, pageSize }) =>
    db.feedPost.findMany({
      where: {
        status: "published",
        deletedAt: null,
        moderationState: "visible",
        publishedAt: { not: null },
        ...(bookmarksOnly
          ? { bookmarks: { some: { userId: actorId } } }
          : { author: { feedSubscribers: { none: { userId: actorId, hidden: true } } } }),
        ...(cursor
          ? {
              OR: [
                { publishedAt: { lt: cursor.date } },
                { publishedAt: cursor.date, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            role: true,
            profile: { select: { fullName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    });
