/** DTO и типы сущности Article (статьи) */

export interface ArticleListDto {
  id: string;
  title: string;
  slug: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  contentType: "TEXT" | "HTML";
  visibility: "PUBLIC" | "PAID";
  priceRub: number | null;
  videoUrl: string | null;
  logoImg: string;
  imageUrls: string[];
  likeCount: number;
  isLiked: boolean;
  hasAccess: boolean;
  viewCount: number;
  description: string;
  createdAt: string;
}

export interface ArticleDetailDto extends ArticleListDto {
  /** null для PAID без доступа — контент скрыт */
  content: string | null;
}

export interface CreateArticleInput {
  title: string;
  contentType: "TEXT" | "HTML";
  content: string;
  visibility: "PUBLIC" | "PAID";
  priceRub?: number | null;
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
