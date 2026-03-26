import { redirect } from "next/navigation";

/**
 * Старый маршрут подтверждения через Telegram — перенаправляем на вход.
 */
export default function ConfirmLegacyPage() {
  redirect("/login");
}
