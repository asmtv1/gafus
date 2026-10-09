import { createFeedClient, type FeedTransport } from "@gafus/types";
import { apiClient } from "./client";

export const feedTransport: FeedTransport = async <T>(path: string, options: Parameters<FeedTransport>[1] = {}): Promise<T> => {
  const response = await apiClient<T>(`/api/v1/feed/${path}`, { ...options, suppressSubscriptionPaywall: true });
  if (!response.success || response.data === undefined) {
    const error = new Error(response.error ?? "Не удалось загрузить ленту") as Error & { code?: string };
    error.code = response.code;
    throw error;
  }
  return response.data;
};
export const feedApi = createFeedClient(feedTransport);
