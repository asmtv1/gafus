import { useCSRFStore } from "@gafus/csrf";
export async function chatApi<T>(
  action = "",
  options: {
    method?: string;
    body?: unknown;
    chatId?: string;
    community?: boolean;
    cursor?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    const store = useCSRFStore.getState();
    if (!store.isTokenValid()) await store.fetchToken();
    const token = useCSRFStore.getState().token;
    if (!token)
      throw new Error("Не удалось подготовить запрос. Обновите страницу и попробуйте ещё раз.");
    headers["X-CSRF-Token"] = token;
  }
  const query = new URLSearchParams();
  if (options.chatId) query.set("chatId", options.chatId);
  if (options.cursor) query.set("cursor", options.cursor);
  const form = options.body instanceof FormData;
  if (options.body && !form) headers["Content-Type"] = "application/json";
  const response = await fetch(
    `/api/v1/${options.community ? "community-chat" : "cynologist-chat"}${action ? `/${action}` : ""}?${query}`,
    {
      method,
      signal: options.signal,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      body: options.body
        ? form
          ? (options.body as FormData)
          : JSON.stringify(options.body)
        : undefined,
    },
  );
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error ?? "Не удалось подключиться");
  return result.data as T;
}
