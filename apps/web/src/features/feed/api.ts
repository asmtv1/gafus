import { useCSRFStore } from "@gafus/csrf";
import { createFeedClient, type FeedTransport } from "@gafus/types";

export const feedTransport: FeedTransport = async <T>(path: string, options: NonNullable<Parameters<FeedTransport>[1]> = {}) => {
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
  const result = await fetch(`/api/v1/feed/${path}`, {
    method, credentials: "same-origin", cache: "no-store", headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload: { success: boolean; data?: T; error?: string; code?: string } = await result.json();
  if (!result.ok || !payload.success || payload.data === undefined) {
    const error = new Error(payload.error ?? "Лента временно недоступна") as Error & { code?: string };
    error.code = payload.code;
    throw error;
  }
  return payload.data;
};
export const feedApi = createFeedClient(feedTransport);
