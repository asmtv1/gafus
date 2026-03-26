import { Redirect } from "expo-router";
import { useEffect } from "react";

import { useAuthStore } from "@/shared/stores";

/**
 * Старый экран ожидания Telegram. Очищаем устаревшее состояние и отправляем на вход.
 */
export default function ConfirmDeprecatedScreen() {
  const clearPendingConfirmPhone = useAuthStore((s) => s.clearPendingConfirmPhone);

  useEffect(() => {
    clearPendingConfirmPhone();
  }, [clearPendingConfirmPhone]);

  return <Redirect href="/login" />;
}
