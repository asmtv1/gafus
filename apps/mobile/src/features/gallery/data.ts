import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import * as Crypto from "expo-crypto";
import { useIsFocused } from "@react-navigation/native";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  privateGalleryReads,
  projectGalleryPage,
  galleryExpiryDelay,
  verifiedGalleryActor,
  sameGalleryActor,
} from "./privateRead";
import { useAuthStore } from "@/shared/stores/authStore";
import { registerGalleryClient } from "./session";

export const galleryKeys = {
  owner: (viewer: string, owner: string) => ["gallery", viewer, owner] as const,
  albums: (viewer: string, owner: string) => ["gallery", viewer, owner, "albums"] as const,
  album: (viewer: string, owner: string, album: string) =>
    ["gallery", viewer, owner, album] as const,
};
export function useGalleryContext() {
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.isAuthenticated && !s.isLoading);
  const cache = useQueryClient();
  const binding = authReady ? verifiedGalleryActor() : null;
  const ownerId = binding?.ownerId;
  const authEpoch = binding?.authEpoch;
  const actor = useMemo(
    () => (ownerId && authEpoch ? { ownerId, authEpoch } : null),
    [ownerId, authEpoch],
  );
  useEffect(() => {
    registerGalleryClient(cache);
  }, [cache]);
  return {
    viewer: actor ? `${actor.ownerId}:${actor.authEpoch}` : "",
    actor,
    username: actor ? (user?.username ?? "") : "",
    cache,
  };
}
export function useForeground() {
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => sub.remove();
  }, []);
  return active && focused;
}
export function useAlbums(owner: string) {
  const { viewer, actor } = useGalleryContext();
  const foreground = useForeground();
  const query = useInfiniteQuery({
    queryKey: galleryKeys.albums(viewer, owner),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!actor || !sameGalleryActor(actor)) throw new Error("GALLERY_SESSION_CHANGED");
      const data = await privateGalleryReads(actor).listAlbums(owner, {
        cursor: pageParam,
        pageSize: 20,
      });
      if (!sameGalleryActor(actor)) throw new Error("GALLERY_SESSION_CHANGED");
      return projectGalleryPage(data, "albums");
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!actor && !!owner && foreground,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const { refetch } = query;
  const expiries = query.data?.pages.flatMap((page) => page.items) ?? [];
  const expiryDelay = galleryExpiryDelay(expiries);
  useEffect(() => {
    if (!foreground || !actor || expiryDelay == null) return;
    const timer = setTimeout(() => {
      if (sameGalleryActor(actor)) void refetch();
    }, expiryDelay);
    return () => clearTimeout(timer);
  }, [foreground, viewer, expiryDelay, actor, refetch]);
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
  // Never print raw transport/URL/server error strings: signed signatures and
  // private gallery keys may be embedded in exception messages.
  return "Не удалось загрузить данные галереи. Проверьте доступ и интернет, затем повторите попытку.";
}
export const requestId = () => Crypto.randomUUID();
