"use client";

import { serverCheckUserConfirmedAction } from "@shared/server-actions";
import { createWebLogger } from "@gafus/logger";
import { useCaughtError } from "@shared/hooks/useCaughtError";
import { useSearchParams } from "next/navigation";
import { useEffect, useTransition } from "react";

// Создаем логгер для ConfirmClient
const logger = createWebLogger("web-confirm-client");

export default function ConfirmClient() {
  const [catchError] = useCaughtError();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!phone) return;

    const interval = setInterval(() => {
      startTransition(async () => {
        try {
          const confirmed = await serverCheckUserConfirmedAction(phone);
          if (confirmed) {
            clearInterval(interval);
            alert("✅ Номер подтверждён. Выполняется вход...");
            window.location.href = "/login";
          }
        } catch (error) {
          logger.error("Ошибка при проверке подтверждения номера", error as Error, {
            operation: "confirm_phone_check_error",
            phone: phone,
          });
          catchError(error);
        }
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [phone]);

  return <div>{isPending && <p>Проверяем подтверждение...</p>}</div>;
}
