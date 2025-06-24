"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Редиректит авторизованного пользователя на указанный путь.
 * `target` = '/courses' по умолчанию.
 */
export function useRedirectIfAuth(target: string = "/courses") {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      router.replace(target);
    }
  }, [status, session?.user?.id, target, router]);
}

export default function ClientRedirectIfAuth({
  to = "/courses",
}: {
  to?: string;
}) {
  useRedirectIfAuth(to);
  return null; // ничего не рендерим
}
