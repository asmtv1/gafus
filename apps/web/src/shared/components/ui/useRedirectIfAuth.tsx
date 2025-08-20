"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";

/**
 * Редиректит авторизованного пользователя на указанный путь.
 * `target` = '/courses' по умолчанию.
 */
export function useRedirectIfAuth(target = "/courses") {
  const sessionResult = useSession();
  const session = sessionResult?.data;
  const status = sessionResult?.status ?? "unauthenticated";
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      router.replace(target);
    }
  }, [status, session?.user?.id, target, router]);
}

export default function ClientRedirectIfAuth({ to = "/courses" }: { to?: string }) {
  useRedirectIfAuth(to);
  return null; // ничего не рендерим
}
