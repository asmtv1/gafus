"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Клиентский редирект для корректной работы с Next.js клиентской навигацией
 * Работает в паре с middleware для полного покрытия всех сценариев
 */
export function ClientRedirect() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    console.log("🔍 ClientRedirect:", { status, pathname, hasUser: !!session?.user });
    
    // Редиректим только авторизованных пользователей с главной страницы
    if (status === "authenticated" && session?.user && pathname === "/") {
      console.log("✅ ClientRedirect: Calling router.replace('/courses')");
      router.replace("/courses");
    }
  }, [status, session, router, pathname]);

  return null;
}

