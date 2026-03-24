"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

import { reportClientError } from "@gafus/error-handling";

import { usePetsStore } from "@shared/stores";

interface PetsProviderProps {
  children: React.ReactNode;
}

export default function PetsProvider({ children }: PetsProviderProps) {
  const { fetchPets } = usePetsStore();
  const { status, data: session } = useSession();
  const hasFetched = useRef(false);

  useEffect(() => {
    // Защита от повторных вызовов и race conditions
    if (status === "authenticated" && session?.user && !hasFetched.current) {
      hasFetched.current = true;
      fetchPets().catch((error) => {
        reportClientError(error, { issueKey: "PetsProvider", keys: { operation: "fetch_pets" } });
        // Сбрасываем флаг при ошибке для возможности повтора
        hasFetched.current = false;
      });
    }

    // Сбрасываем флаг при logout
    if (status === "unauthenticated") {
      hasFetched.current = false;
    }
  }, [fetchPets, status, session]);

  return <>{children}</>;
}
