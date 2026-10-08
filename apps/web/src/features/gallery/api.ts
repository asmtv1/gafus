import { gallerySession, assertGallerySession } from "./session";
import { useCSRFStore } from "@gafus/csrf";
import { createGalleryClient, type GalleryTransport } from "@gafus/types";

export const galleryTransport: GalleryTransport = async <T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown } = {},
) => {
  const ticket = gallerySession.snapshot();
  assertGallerySession(ticket);
  const controller = new AbortController();
  const unregister = gallerySession.registerAbort(() => controller.abort());
  try {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = {};
    if (method !== "GET") {
      const store = useCSRFStore.getState();
      if (!store.isTokenValid()) await store.fetchToken();
      assertGallerySession(ticket);
      const token = useCSRFStore.getState().token;
      if (!token) throw new Error("Обновите страницу и попробуйте ещё раз");
      headers["X-CSRF-Token"] = token;
    }
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`/api/v1/gallery/${path}`, {
      signal: controller.signal,
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    assertGallerySession(ticket);
    if (response.status === 401) {
      gallerySession.invalidate(ticket);
      throw Object.assign(new Error("Сессия завершена. Войдите снова."), { code: "UNAUTHORIZED" });
    }
    const result = await response.json();
    assertGallerySession(ticket);
    if (!response.ok || !result.success) {
      const error = new Error(result.error ?? "Не удалось выполнить запрос галереи") as Error & {
        code?: string;
        details?: unknown;
      };
      error.code = result.code;
      error.details = result.details;
      throw error;
    }
    return result.data as T;
  } finally {
    unregister();
  }
};
export const galleryApi = createGalleryClient(galleryTransport);
