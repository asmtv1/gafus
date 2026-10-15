/** DTO и типы сущности Article (статьи) */

/** Просмотр статьи авторизованным пользователем (для панели тренера) */
export interface ArticleViewerDto {
  userId: string;
  username: string;
  fullName: string | null;
  lastViewedAt: string;
}

export interface ArticleListDto {
  id: string;
  title: string;
  slug: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  contentType: "TEXT" | "HTML";
  visibility: "PUBLIC" | "PAID";
  videoUrl: string | null;
  logoImg: string;
  imageUrls: string[];
  likeCount: number;
  isLiked: boolean;
  hasAccess: boolean;
  viewCount: number;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleDetailDto extends ArticleListDto {
  /** null для PAID без доступа — контент скрыт */
  content: string | null;
  monetization?: {
    locked: boolean;
    target?: {
      targetType: "ARTICLE";
      targetId: string;
    };
  };
}

export interface CreateArticleInput {
  title: string;
  contentType: "TEXT" | "HTML";
  content: string;
  visibility: "PUBLIC" | "PAID";
  videoUrl?: string | null;
  logoImg?: string;
  imageUrls?: string[];
  slug: string;
  /** Обязательно для visibility=PAID */
  description?: string;
}

export interface UpdateArticleInput extends Partial<CreateArticleInput> {
  id: string;
}
