import { authOptions } from "@gafus/auth";
import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  People,
  AdminPanelSettings,
  Notifications,
  TrendingUp,
  Assessment,
  SmartToy as SmartToyIcon,
} from "@mui/icons-material";

import MobileMenu from "@/shared/components/MobileMenu";
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
      {/* Мобильное меню */}
      <MobileMenu userName={userName} avatarUrl={avatarUrl} userRole={session.user.role} />

      <aside className={styles.sidebar}>
        <div className={styles.profilWrapper}>
          <div className={styles.userName}>{userName || "\u00A0"}</div>
          <Image src={avatarUrl} alt="Avatar" width={48} height={48} className={styles.avatar} />
        </div>

        {/* Основное меню */}
        <Link href="/main-panel/users" className={styles.button}>
          <People sx={{ mr: 1.5, fontSize: 20 }} />
          Пользователи платформы
        </Link>
        <Link href="/main-panel/admin" className={styles.button}>
          <AdminPanelSettings sx={{ mr: 1.5, fontSize: 20 }} />
          Администрирование
        </Link>

        {/* Push-рассылка и Re-engagement только для админов */}
        {session.user.role === "ADMIN" && (
          <>
            <div className={styles.divider}></div>
            <Link href="/main-panel/broadcasts" className={styles.button}>
              <Notifications sx={{ mr: 1.5, fontSize: 20 }} />
              Push-рассылка
            </Link>
            <Link href="/main-panel/reengagement" className={styles.button}>
              <TrendingUp sx={{ mr: 1.5, fontSize: 20 }} />
              Re-engagement
            </Link>
          </>
        )}

        {/* Статистика по презентации для ADMIN и MODERATOR */}
        {["ADMIN", "MODERATOR"].includes(session.user.role) && (
          <>
            <div className={styles.divider}></div>
            <Link href="/main-panel/presentation-stats" className={styles.button}>
              <Assessment sx={{ mr: 1.5, fontSize: 20 }} />
              Стата по презентации
            </Link>
            <Link href="/main-panel/ai-chat-configs" className={styles.button}>
              <SmartToyIcon sx={{ mr: 1.5, fontSize: 20 }} />
              AI чат тренеров
            </Link>
          </>
        )}
      </aside>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
