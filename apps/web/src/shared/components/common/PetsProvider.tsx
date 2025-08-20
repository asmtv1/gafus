"use client";

import { usePetsStore } from "@shared/stores";
import { useSession } from "next-auth/react";
import { useEffect } from "react";

interface PetsProviderProps {
  children: React.ReactNode;
}

export default function PetsProvider({ children }: PetsProviderProps) {
  const { fetchPets } = usePetsStore();
  const { status } = useSession();

  useEffect(() => {
    // Загружаем питомцев только для авторизованных пользователей
    if (status === "authenticated") {
      fetchPets();
    }
  }, [fetchPets, status]);

  return <>{children}</>;
}
