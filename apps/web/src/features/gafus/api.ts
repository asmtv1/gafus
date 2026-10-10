import { useCSRFStore } from "@gafus/csrf";
import type {
  GafusHistoryPage, GafusStatusDto, GafusUnlockRequest, GafusUnlockResult, GafusMiniGuideDto,
  GafusReactionProgressDto,
} from "@gafus/types";

type ApiResponse<T> = { success: boolean; data?: T; error?: string; code?: string };

async function gafusRequest<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    const tokens = useCSRFStore.getState();
    if (!tokens.isTokenValid()) await tokens.fetchToken();
    const token = useCSRFStore.getState().token;
    if (!token) throw new Error("Не удалось проверить запрос. Обновите страницу.");
    headers["X-CSRF-Token"] = token;
  }
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`/api/v1/gafus/${path}`, {
    method, headers, credentials: "same-origin", cache: "no-store",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json() as ApiResponse<T>;
  if (!response.ok || !payload.success || payload.data === undefined) {
    const error = new Error(payload.error ?? "Сервис Гафусов временно недоступен") as Error & { code?: string };
    error.code = payload.code;
    throw error;
  }
  return payload.data;
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