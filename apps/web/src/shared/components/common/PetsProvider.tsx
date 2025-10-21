"use client";

import { usePetsStore } from "@shared/stores";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

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
      fetchPets().catch(() => {
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
