"use client";
import { useState, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { gallerySession } from "./session";
/** Signed URLs stay in an isolated memory cache, outside the app's persisted query provider. */
export function GalleryScope({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } }),
  );
  const { data, status } = useSession();
  const epoch = useSyncExternalStore(gallerySession.subscribe, gallerySession.snapshot, () => 0);
  const identity = status === "authenticated" ? data?.user?.id : undefined;
  useLayoutEffect(() => {
    if (status !== "loading") gallerySession.setIdentity(identity);
  }, [identity, status]);
  useLayoutEffect(
    () =>
      gallerySession.subscribe(() => {
        void client.cancelQueries();
        client.clear();
      }),
    [client],
  );
  return (
    <QueryClientProvider client={client}>
      {gallerySession.blocked() ? (
        <p role="alert">
          Сессия завершена.{" "}
          <Link
            href="/login"
            onClick={(event) => {
              event.preventDefault();
              void signOut({ callbackUrl: "/login", redirect: false })
                .then(() => {
                  gallerySession.endIdentity();
                  window.location.assign("/login");
                })
                .catch(() => {
                  window.location.assign("/login");
                });
            }}
          >
            Войдите снова
          </Link>
          , чтобы открыть галерею.
        </p>
      ) : (
        <GalleryContent key={`${identity ?? "anonymous"}:${epoch}`}>{children}</GalleryContent>
      )}
    </QueryClientProvider>
  );
}
function GalleryContent({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
