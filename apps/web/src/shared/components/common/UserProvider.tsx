"use client";

import { useUserStore } from "@shared/stores";
import { useSession } from "next-auth/react";
import { useEffect } from "react";

import type { User } from "@gafus/types/stores/userStore";

interface UserProviderProps {
  children: React.ReactNode;
}

export default function UserProvider({ children }: UserProviderProps) {
  const { data: session, status } = useSession();
  const { setUser, clearUser } = useUserStore();

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      // Преобразуем данные сессии в формат User
      const user: User = {
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
  }, [session, status, setUser, clearUser]);

  return <>{children}</>;
}
