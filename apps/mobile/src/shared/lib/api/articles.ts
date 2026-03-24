import { getOrCreateArticleGuestVisitorKey } from "@/shared/lib/articles/articleGuestVisitorKey";

import { apiClient, type ApiResponse } from "./client";
import type { ArticleListDto, ArticleDetailDto } from "@gafus/types";

export const articlesApi = {
  getAll: (): Promise<ApiResponse<ArticleListDto[]>> =>
    apiClient<ArticleListDto[]>("/api/v1/articles"),

  getBySlug: (slug: string): Promise<ApiResponse<ArticleDetailDto>> =>
    apiClient<ArticleDetailDto>(`/api/v1/articles/${slug}`),

  toggleLike: (
    articleId: string
  ): Promise<ApiResponse<{ isLiked: boolean }>> =>
    apiClient<{ isLiked: boolean }>(
      `/api/v1/articles/${articleId}/like`,
      { method: "POST" }
    ),

  incrementView: async (slug: string): Promise<ApiResponse<void>> => {
    const visitorKey = await getOrCreateArticleGuestVisitorKey();
    return apiClient<void>(`/api/v1/articles/${slug}/view`, {
      method: "POST",
      body: { visitorKey },
    });
  },
};
