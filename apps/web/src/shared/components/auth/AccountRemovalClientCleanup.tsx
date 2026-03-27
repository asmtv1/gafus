"use client";

import { useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { clearPersistedWebAppState } from "@shared/lib/auth/clearPersistedWebAppState";
import { clearProfilePageCache } from "@shared/utils/clearProfileCache";

/**
 * После redirect с /login?accountRemoved=1 — чистим кэши и сессию на клиенте,
 * чтобы «Назад» не показывало старые курсы/избранное из памяти и localStorage.
 */
export default function AccountRemovalClientCleanup() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (searchParams.get("accountRemoved") !== "1" || ran.current) return;
    ran.current = true;

    void (async () => {
      clearPersistedWebAppState();
      queryClient.clear();
      await signOut({ redirect: false }).catch(() => undefined);
      await clearProfilePageCache(null).catch(() => undefined);
      router.replace("/login");
    })();
  }, [searchParams, router, queryClient]);

  return null;
}
