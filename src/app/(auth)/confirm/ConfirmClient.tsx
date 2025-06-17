"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { checkUserConfirmed } from "@/lib/auth/checkUserConfirmed";

export default function ConfirmClient() {
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone");
  const [caughtError, setCaughtError] = useState<Error | null>(null);

  useEffect(() => {
    if (!phone) return;

    const interval = setInterval(async () => {
      try {
        const confirmed = await checkUserConfirmed(phone);
        if (confirmed) {
          clearInterval(interval);
          alert("✅ Номер подтверждён. Выполняется вход...");
          window.location.href = "/login";
        }
      } catch (error) {
        console.error("Ошибка при проверке подтверждения номера:", error);
        setCaughtError(error as Error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [phone]);

  if (caughtError) {
    throw caughtError;
  }

  return null; // Клиентская часть ничего не рендерит
}
