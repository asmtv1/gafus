"use client";

import { serverCheckUserConfirmed } from "@shared/lib/auth/login-utils";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export default function ConfirmClient() {
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone");
  const [caughtError, setCaughtError] = useState<Error | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!phone) return;

    const interval = setInterval(() => {
      startTransition(async () => {
        try {
          const confirmed = await serverCheckUserConfirmed(phone);
          if (confirmed) {
            clearInterval(interval);
            alert("✅ Номер подтверждён. Выполняется вход...");
            window.location.href = "/login";
          }
        } catch (error) {
          console.error("Ошибка при проверке подтверждения номера:", error);
          setCaughtError(error as Error);
        }
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [phone]);

  if (caughtError) {
    throw caughtError;
  }

  return <div>{isPending && <p>Проверяем подтверждение...</p>}</div>;
}
