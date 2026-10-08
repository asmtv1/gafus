import { createGalleryClient, type GalleryTransport } from "@gafus/types";
import { apiClient } from "./client";

export const galleryTransport: GalleryTransport = async <T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown } = {},
) => {
  const response = await apiClient<T>(`/api/v1/gallery/${path}`, { ...options, suppressSubscriptionPaywall: true });
  if (!response.success || response.data === undefined) {
    const error = new Error(response.error ?? "Не удалось выполнить запрос галереи") as Error & { code?: string; details?: Record<string, unknown> };
    error.code = response.code;
    error.details = response.details;
    throw error;
  }
  return response.data;
};
export const galleryApi = createGalleryClient(galleryTransport);
