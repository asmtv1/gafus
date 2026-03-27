"use client";

import { REACT_QUERY_PERSIST_STORAGE_KEY } from "@gafus/react-query";
import { signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { clearPersistedWebAppState } from "@shared/lib/auth/clearPersistedWebAppState";
import { clearProfilePageCache } from "@shared/utils/clearProfileCache";

/**
 * После redirect с /login?accountRemoved=1 — чистим кэши и сессию на клиенте,
 * чтобы «Назад» не показывало старые курсы/избранное из памяти и localStorage.
 *
 * Не используем useQueryClient: в prod-сборке возможен второй экземпляр @tanstack/react-query
 * относительно PersistQueryClientProvider из @gafus/react-query → «No QueryClient set».
 */
export default function AccountRemovalClientCleanup() {
  const searchParams = useSearchParams();
  const ran = useRef(false);

  useEffect(() => {
    if (searchParams.get("accountRemoved") !== "1" || ran.current) return;
    ran.current = true;

    void (async () => {
      clearPersistedWebAppState();
      try {
        localStorage.removeItem(REACT_QUERY_PERSIST_STORAGE_KEY);
      } catch {
        /* приватный режим / запрет storage */
      }
      await signOut({ redirect: false }).catch(() => undefined);
      await clearProfilePageCache(null).catch(() => undefined);
      window.location.replace("/login");
    })();
  }, [searchParams]);

  return null;
}
