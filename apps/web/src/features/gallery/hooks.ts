"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { gallerySession } from "./session";
import { galleryApi } from "./api";

export function useGalleryIdentity() {
  useSyncExternalStore(gallerySession.subscribe, gallerySession.snapshot, () => 0);
  const { data, status } = useSession();
  const cache = useQueryClient();
  const viewerId = data?.user?.id;
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (status === "unauthenticated") {
      void cache.cancelQueries({ queryKey: ["gallery"] });
      cache.removeQueries({ queryKey: ["gallery"] });
    }
  }, [cache, status]);
  return {
    viewerId,
    username: data?.user?.username,
    visible,
    authenticated: status === "authenticated" && !gallerySession.blocked(),
  };
}
export function refreshDelay(expiries: (string | null | undefined)[]) {
  const times = expiries
    .filter(Boolean)
    .map((value) => Date.parse(value!))
    .filter(Number.isFinite);
  return times.length ? Math.max(1000, Math.min(...times) - Date.now() - 15000) : false;
}
export function useGalleryAlbums(owner: string, preview = false) {
  const identity = useGalleryIdentity();
  const query = useInfiniteQuery({
    queryKey: ["gallery", identity.viewerId, owner, "albums", preview],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      galleryApi.listAlbums(owner, { cursor: pageParam, pageSize: preview ? 4 : 20 }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: identity.authenticated && !!owner,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) =>
      identity.visible
        ? refreshDelay(
            query.state.data?.pages.flatMap((page) =>
              page.items.map((album) => album.urlsExpireAt),
            ) ?? [],
          )
        : false,
    refetchIntervalInBackground: false,
  });
  return {
    ...identity,
    query,
    albums: query.data?.pages.flatMap((page) => page.items) ?? [],
    info: query.data?.pages[0],
  };
}
export function galleryMessage(error: unknown) {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    GALLERY_DISABLED: "Галерея пока недоступна.",
    FORBIDDEN: "У вас нет доступа к этому альбому.",
    NOT_FOUND: "Альбом или фотография недоступны.",
    QUOTA_EXCEEDED:
      "Для этого файла не осталось места. Остальные файлы очереди продолжают загружаться.",
    GALLERY_QUOTA_EXCEEDED:
      "Для этого файла не осталось места. Остальные файлы продолжают загружаться.",
    UPLOAD_EXPIRED: "Время загрузки истекло. Выберите файл и повторите попытку.",
  };
  return (
    (code && messages[code]) ||
    (error instanceof Error ? error.message : "Не удалось выполнить действие. Попробуйте ещё раз.")
  );
}
