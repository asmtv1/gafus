import type { ApiResponse } from "@/shared/lib/api/client";

type VideoUrlData = { url: string; videoId?: string };

export function resolveVideoUrlResponse(response: ApiResponse<VideoUrlData>): {
  url: string | null;
  videoId: string | null;
  error: string | null;
} {
  if (response.success && response.data?.url) {
    return {
      url: response.data.url,
      videoId: response.data.videoId ?? null,
      error: null,
    };
  }
  return {
    url: null,
    videoId: null,
    error: response.error || "Не удалось получить URL видео",
  };
}
