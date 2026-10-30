import { getOrCreateArticleGuestVisitorKey } from "@/shared/lib/articles/articleGuestVisitorKey";

import { apiClient, type ApiResponse } from "./client";
import type { ArticleListDto, ArticleDetailDto } from "@gafus/types";

/** Match existing Hono/Web article slug contract, including Cyrillic deep links.
 * Never concatenate caller input into a mutable HTTP path unescaped. */
export function encodedArticleApiSlug(slug: string): string {
  if (!/^[\p{L}\p{N}_-]{1,120}$/u.test(slug))
    throw new Error("INVALID_ARTICLE_SLUG");
  return encodeURIComponent(slug);
}

function articleLikeId(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("INVALID_ARTICLE_ID");
  return id;
}

export const articlesApi = {
  getAll: (): Promise<ApiResponse<ArticleListDto[]>> =>
    apiClient<ArticleListDto[]>("/api/v1/articles"),

  getBySlug: async (slug: string): Promise<ApiResponse<ArticleDetailDto>> => {
    const response = await apiClient<ArticleDetailDto>(
      `/api/v1/articles/${encodedArticleApiSlug(slug)}`,
    );
    if (!response.success || !response.data) return response;
    const detail = response.data;
    // Even a malformed legacy server projection must never put locked paid
    // text/media into the native React Query cache or hidden WebView props.
    // Core's subscription policy gates PUBLIC as well as PAID while the
    // feature flag is enabled; visibility is not an entitlement decision.
    if (detail.hasAccess !== true || detail.content === null) {
      return { ...response, data: { ...detail, hasAccess: false,
        content: null, videoUrl: null, imageUrls: [] } };
    }
    return response;
  },

  toggleLike: (
    articleId: string,
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<{ isLiked: boolean }>> =>
    apiClient<{ isLiked: boolean }>(`/api/v1/articles/${articleLikeId(articleId)}/like`, {
      method: "POST",
      // Toggle is not idempotent: never replay it after token refresh or actor switch.
      skipAuthRefreshReplay: true,
      ...(requestGuard ? { requestGuard } : {}),
    }),

  incrementView: async (slug: string, requestGuard?: () => boolean): Promise<ApiResponse<void>> => {
    const encodedSlug = encodedArticleApiSlug(slug);
    if (requestGuard && !requestGuard()) throw new Error("ARTICLE_ACTOR_CHANGED");
    const visitorKey = await getOrCreateArticleGuestVisitorKey();
    if (requestGuard && !requestGuard()) throw new Error("ARTICLE_ACTOR_CHANGED");
    return apiClient<void>(`/api/v1/articles/${encodedSlug}/view`, {
      method: "POST",
      body: { visitorKey },
      skipAuthRefreshReplay: true,
      ...(requestGuard ? { requestGuard } : {}),
    });
  },
};
