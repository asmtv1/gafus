// apps/trainer-panel/src/app/(main)/main-panel/layout.tsx
import { authOptions } from "@gafus/auth";
import Link from "next/link";
import { getServerSession } from "next-auth";

import { SafeImage } from "@/components/ui/SafeImage";
import styles from "./main-panel.module.css";

export default async function MainPanelLayout({ children }: { children: React.ReactNode }) {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; username: string; role: string; avatarUrl?: string };
  } | null;
  if (!session) return <div>Не авторизован</div>;

  const userName = session.user.username;
  const avatarUrl = session.user.avatarUrl ?? "/uploads/avatar.svg";

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.profilWrapper}>
          <div className={styles.userName}>{userName || "\u00A0"}</div>
          <SafeImage
            src={avatarUrl}
            alt="Avatar"
            width={32}
            height={32}
            className={styles.avatar}
            fallbackSrc="/uploads/avatar.svg"
            priority
          />
        </div>
        <Link href="/main-panel/statistics" className={styles.button}>
          Общая Статистика
        </Link>
        <Link href="/main-panel/steps" className={styles.button}>
          Созданные шаги
        </Link>
        <Link href="/main-panel/days" className={styles.button}>
          Созданные дни
        </Link>
        <Link href="/main-panel/steps/new" className={styles.button}>
          Создать новый шаг
        </Link>
        <Link href="/main-panel/days/new" className={styles.button}>
          Создать новый день
        </Link>
        <Link href="/main-panel/courses/new" className={styles.button}>
          Создать новый курс
        </Link>

        {/* Пункт меню только для админов и модераторов */}
        {(session.user.role === "ADMIN" || session.user.role === "MODERATOR") && (
          <Link href="/main-panel/users" className={styles.button}>
            Пользователи платформы
          </Link>
        )}
      </aside>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
