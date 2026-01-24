import { redirect } from "next/navigation";

/**
 * Главная страница админ-панели
 * Редиректит на основную панель управления
 */
export default function HomePage() {
  redirect("/main-panel");
}
