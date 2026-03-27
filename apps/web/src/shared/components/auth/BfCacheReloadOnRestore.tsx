"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * После «Назад» из bfcache страница может показать старый снимок (курсы, избранное).
 * Перезагружаем только для типичных авторизованных маршрутов.
 */
function shouldReloadPath(pathname: string | null): boolean {
  if (!pathname) return false;
  const p = pathname;
  return (
    p.startsWith("/courses") ||
    p.startsWith("/profile") ||
    p.startsWith("/favorites") ||
    p.startsWith("/trainings") ||
    p.startsWith("/articles") ||
    p.startsWith("/achievements") ||
    p.startsWith("/diary")
  );
}

export default function BfCacheReloadOnRestore() {
  const pathname = usePathname();

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && shouldReloadPath(pathname)) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [pathname]);

  return null;
}
