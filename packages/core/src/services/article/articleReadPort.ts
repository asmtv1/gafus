import type { ArticleListDto, CreateArticleInput } from "@gafus/types";

/**
 * Core-owned interface to article SQL projections. Core never imports the
 * implementation, and all actor/owner fencing stays inside server rows.
 */
export interface ArticleStoredListRow {
  id: string;
  title: string;
  slug: string;
  authorId: string;
  contentType: ArticleListDto["contentType"];
  visibility: ArticleListDto["visibility"];
  videoUrl: string | null;
  logoImg: string | null;
  imageUrls: string[];
  viewCount: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { username: string; profile: { avatarUrl: string | null } | null };
  _count: { articleLikes: number };
  articleLikes?: { userId: string }[];
}

export interface ArticleReadPort {
  readArticleCatalogRows(
    userId: string | undefined,
    take: number,
    skip: number,
    authorId?: string,
  ): Promise<ArticleStoredListRow[]>;
  readArticleGrantRows(userId: string, rows: { id: string }[]): Promise<{ targetKey: string }[]>;
  readArticleDetailRow(
    slug: string,
    userId?: string,
  ): Promise<(ArticleStoredListRow & { content: string }) | null>;
  readArticleForEditRow(
    id: string,
  ): Promise<
    | (CreateArticleInput & {
        authorId: string;
        logoImg: string;
        imageUrls: string[];
        description: string;
      })
    | null
  >;
  readArticleIdBySlug(slug: string): Promise<{ id: string } | null>;
  readArticleViewersForAuthorRow(
    articleId: string,
    authorId: string,
  ): Promise<{
    viewers: {
      lastViewedAt: Date;
      user: {
        id: string;
        username: string;
        profile: { fullName: string | null } | null;
      };
    }[];
  } | null>;
  createArticleRow(
    data: CreateArticleInput & { authorId: string; id?: string },
  ): Promise<{ id: string; slug: string }>;
  /** Must atomically deduplicate visitor and increment view count in SQL. */
  recordArticleViewRow(
    articleId: string,
    userId: string | null,
    guestKey: string | null,
  ): Promise<void>;
}
