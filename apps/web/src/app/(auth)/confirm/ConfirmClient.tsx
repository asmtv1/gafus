"use client";

import { getPendingConfirmationStatus } from "@shared/server-actions";
import { createWebLogger } from "@gafus/logger";
import { useCaughtError } from "@shared/hooks/useCaughtError";
import { useEffect, useState, useTransition } from "react";

const logger = createWebLogger("web-confirm-client");

export default function ConfirmClient() {
  const [catchError] = useCaughtError();
  const [status, setStatus] = useState<{
    hasPending: boolean;
    confirmed: boolean;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      startTransition(async () => {
        try {
          const result = await getPendingConfirmationStatus();
          if (cancelled) return;
          setStatus(result);
          if (result.hasPending && result.confirmed) {
            alert("✅ Номер подтверждён. Выполняется вход...");
            window.location.href = "/login";
          }
        } catch (error) {
          logger.error("Ошибка при проверке подтверждения номера", error as Error, {
            operation: "confirm_phone_check_error",
          });
          catchError(error);
        }
      });
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [catchError]);

  useEffect(() => {
    if (!status?.hasPending || status.confirmed) return;

    const interval = setInterval(() => {
      startTransition(async () => {
        try {
          const result = await getPendingConfirmationStatus();
          setStatus(result);
          if (result.confirmed) {
            alert("✅ Номер подтверждён. Выполняется вход...");
            window.location.href = "/login";
          }
        } catch (error) {
          logger.error("Ошибка при проверке подтверждения номера", error as Error, {
            operation: "confirm_phone_poll_error",
          });
          catchError(error);
        }
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [status?.hasPending, status?.confirmed, catchError]);

  if (status === null) {
    return <div>{isPending ? <p>Проверяем...</p> : null}</div>;
  }

  if (!status.hasPending) {
    return (
      <div>
        <p>Подтвердите номер в Telegram. Откройте бота и выполните подтверждение.</p>
      </div>
    );
  }

  return (
    <div>
      {isPending && <p>Проверяем подтверждение...</p>}
      {!isPending && !status.confirmed && (
        <p>Ожидаем подтверждения номера в Telegram...</p>
      )}
    </div>
  );
}
