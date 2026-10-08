import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { galleryApi } from "@/shared/lib/api/gallery";
import { useAuthStore } from "@/shared/stores/authStore";
import { registerGalleryClient } from "./session";

export const galleryKeys = {
  owner: (viewer: string, owner: string) => ["gallery", viewer, owner] as const,
  albums: (viewer: string, owner: string) => ["gallery", viewer, owner, "albums"] as const,
  album: (viewer: string, owner: string, album: string) => ["gallery", viewer, owner, album] as const,
};
export function useGalleryContext() {
  const user = useAuthStore(s => s.user);
  const authenticated = useAuthStore(s => s.isAuthenticated);
  const cache = useQueryClient();
  useEffect(() => { registerGalleryClient(cache); }, [cache]);
  return { viewer: authenticated ? user?.id ?? "" : "", username: user?.username ?? "", cache };
}
export function useForeground() {
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", state => setActive(state === "active"));
    return () => sub.remove();
  }, []);
  return active && focused;
}
export function useAlbums(owner: string) {
  const { viewer } = useGalleryContext();
  const foreground = useForeground();
  const query = useInfiniteQuery({
    queryKey: galleryKeys.albums(viewer, owner),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => galleryApi.listAlbums(owner, { cursor: pageParam, pageSize: 20 }),
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: !!viewer && !!owner && foreground,
    staleTime: 60_000,
    gcTime: 0,
    retry: 1,
  });
  const { refetch } = query;
  useEffect(() => { if (foreground && viewer && owner) void refetch(); }, [foreground, viewer, owner, refetch]);
  return query;
}
export function galleryError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const messages: Record<string, string> = {
    GALLERY_DISABLED: "Галерея пока недоступна.",
    GALLERY_LIMIT_EXCEEDED: "В галерее уже 200 фотографий. Удалите фото, чтобы добавить новые.",
    QUOTA_EXCEEDED: "В галерее уже 200 фотографий. Удалите фото, чтобы добавить новые.",
    FORBIDDEN: "У вас нет доступа к этому альбому.",
    NOT_FOUND: "Альбом или фотография больше недоступны.",
    UPLOAD_EXPIRED: "Время загрузки истекло. Выберите файл заново.",
    INVALID_IMAGE: "Файл не удалось обработать. Выберите JPG, PNG или WebP до 10 МиБ.",
  };
  if (code && messages[code]) return messages[code];
  if (error instanceof Error && !/network|fetch|abort/i.test(error.message)) return error.message;
  return "Не удалось подключиться. Проверьте интернет и повторите попытку.";
}
export const requestId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
