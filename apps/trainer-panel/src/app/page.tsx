import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

export default async function Home() {
  const session = (await getServerSession(authOptions)) as { user: { id: string; username: string; role: string } } | null;
  console.warn("Session in Home:", session);

  if (!session) {
    // Не авторизован — редирект на страницу логина
    redirect("/login");
  }

  const role = session.user.role;
  if (role === "TRAINER" || role === "ADMIN" || role === "MODERATOR") {
    // Авторизован и тренер/админ/модератор — редирект на основную страницу тренера
    redirect("/main-panel");
  }

  // Авторизован, но не тренер — показать сообщение
  return <p>Извините, Вход только для кинологов</p>;
}
