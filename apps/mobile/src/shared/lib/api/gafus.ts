import type {
  GafusHistoryPage, GafusStatusDto, GafusUnlockRequest, GafusUnlockResult, GafusMiniGuideDto,
  GafusReactionProgressDto,
} from "@gafus/types";
import { apiClient } from "./client";

async function gafusRequest<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const response = await apiClient<T>(`/api/v1/gafus/${path}`, {
    ...options,
    suppressSubscriptionPaywall: true,
  });
  if (!response.success || response.data === undefined) {
    const error = new Error(response.error ?? "Не удалось получить данные Гафусов") as Error & { code?: string };
    error.code = response.code;
    throw error;
  }
  return response.data;
}

export const gafusApi = {
  reactionProgress: (postId: string) =>
    gafusRequest<GafusReactionProgressDto>(`reaction-progress/${encodeURIComponent(postId)}`),
  miniGuides: () => gafusRequest<GafusMiniGuideDto[]>("mini-guides"),
  status: () => gafusRequest<GafusStatusDto>("status"),
  history: (cursor?: string, limit = 20) =>
    gafusRequest<GafusHistoryPage>(`history?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
  unlock: (request: GafusUnlockRequest) =>
    gafusRequest<GafusUnlockResult>("unlock", { method: "POST", body: request }),
  guide: (courseId: string) =>
    gafusRequest<{ courseId: string; guideContent: string }>(`mini-guide/${encodeURIComponent(courseId)}`),
};