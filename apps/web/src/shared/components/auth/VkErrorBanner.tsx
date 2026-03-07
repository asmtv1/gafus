"use client";

import { useSearchParams } from "next/navigation";

import styles from "./VkErrorBanner.module.css";

const VK_ERROR_MESSAGES: Record<string, string> = {
  vk_id_auth_failed: "Не удалось войти через VK ID. Попробуйте снова.",
  vk_id_token_failed: "Ошибка обмена кода VK ID. Проверьте настройки приложения.",
  vk_id_profile_failed: "Не удалось получить профиль VK. Попробуйте позже.",
  rate_limit: "Слишком много попыток. Подождите 15 минут.",
  session_required: "Войдите в аккаунт для привязки VK.",
};

export function VkErrorBanner() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const message = urlError ? VK_ERROR_MESSAGES[urlError] : null;

  if (!message) return null;

  return (
    <div className={styles.banner} role="alert">
      {message}
    </div>
  );
}
