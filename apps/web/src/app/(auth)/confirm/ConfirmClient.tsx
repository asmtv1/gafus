"use client";

import { serverCheckUserConfirmedAction } from "@shared/server-actions";
import { createWebLogger } from "@gafus/logger";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

// Создаем логгер для ConfirmClient
const logger = createWebLogger("web-confirm-client");

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
