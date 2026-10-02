import { apiClient, apiClientMultipart } from "./client";
export async function chatApi<T>(
  action = "",
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    chatId?: string;
    community?: boolean;
    cursor?: string;
  } = {},
): Promise<T> {
  const query = new URLSearchParams();
  if (options.chatId) query.set("chatId", options.chatId);
  if (options.cursor) query.set("cursor", options.cursor);
  const res = await apiClient<T>(
    `/api/v1/${options.community ? "community-chat" : "cynologist-chat"}${action ? `/${action}` : ""}?${query}`,
    {
      ...options,
      suppressSubscriptionPaywall: true,
    },
  );
  if (!res.success || res.data === undefined)
    throw new Error(res.error ?? "Не удалось подключиться");
  return res.data;
}
export async function uploadChatFile(
  asset: { uri: string; name: string; mime: string },
  chatId?: string,
  community = false,
) {
  const query = chatId ? `?chatId=${encodeURIComponent(chatId)}` : "";
  const result = await apiClientMultipart<{ id: string; name: string }>(
    `/api/v1/${community ? "community-chat" : "cynologist-chat"}/attachments${query}`,
    () => {
      const data = new FormData();
      data.append("file", {
        uri: asset.uri,
        name: asset.name,
        type: asset.mime,
      } as unknown as Blob);
      return data;
    },
  );
  if (!result.success || !result.data) throw new Error(result.error ?? "Не удалось загрузить файл");
  return result.data;
}
