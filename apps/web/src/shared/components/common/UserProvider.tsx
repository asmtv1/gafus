"use client";

import { useStepStore } from "@shared/stores/stepStore";
import { useUserStore } from "@shared/stores";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

import type { UserData } from "@gafus/types";

interface UserProviderProps {
  children: React.ReactNode;
}

export default function UserProvider({ children }: UserProviderProps) {
  const { data: session, status } = useSession();
  const { setUser, clearUser } = useUserStore();
  const clearAllSteps = useStepStore((state) => state.clearAllSteps);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      // Преобразуем данные сессии в формат UserData
      const user: UserData = {
        id: session.user.id,
        username: session.user.username,
        phone: "", // Нет в сессии, можно добавить позже
        role: session.user.role,
        isConfirmed: true, // Предполагаем, что авторизованный пользователь подтвержден
        avatarUrl: session.user.avatarUrl ?? null,
        createdAt: new Date(), // Нет в сессии
        updatedAt: new Date(), // Нет в сессии
      };

      setUser(user);
    } else if (status === "unauthenticated") {
      clearUser();
    }

    if (status === "loading") {
      return;
    }

    const nextUserId =
      status === "authenticated" && session?.user ? session.user.id : null;

    if (lastUserIdRef.current !== nextUserId) {
      lastUserIdRef.current = nextUserId;
      clearAllSteps();
      void useStepStore.persist.rehydrate();
    }
  }, [session, status, setUser, clearUser, clearAllSteps]);

  return <>{children}</>;
}
