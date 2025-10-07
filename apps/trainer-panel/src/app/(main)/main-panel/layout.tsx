// apps/trainer-panel/src/app/(main)/main-panel/layout.tsx
import { authOptions } from "@gafus/auth";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { 
  FitnessCenter, 
  Schedule, 
  Add,
  People,
  AdminPanelSettings,
  TrendingUp,
  Assignment,
  AutoStories
} from "@mui/icons-material";

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
          <img
            src={avatarUrl}
            alt="Avatar"
            width={48}
            height={48}
            className={styles.avatar}
          />
        </div>
        <Link href="/main-panel/statistics" className={styles.button}>
          <TrendingUp sx={{ mr: 1.5, fontSize: 20 }} />
          Общая Статистика
        </Link>
        <Link href="/main-panel/steps" className={styles.button}>
          <FitnessCenter sx={{ mr: 1.5, fontSize: 20 }} />
          Созданные шаги
        </Link>
        <Link href="/main-panel/days" className={styles.button}>
          <Schedule sx={{ mr: 1.5, fontSize: 20 }} />
          Созданные дни
        </Link>
        <Link href="/main-panel/templates" className={styles.button}>
          <AutoStories sx={{ mr: 1.5, fontSize: 20 }} />
          Библиотека шаблонов
        </Link>
        <Link href="/main-panel/exam-results" className={styles.button}>
          <Assignment sx={{ mr: 1.5, fontSize: 20 }} />
          Результаты экзаменов
        </Link>
        
        <div className={styles.divider}></div>
        
        <Link href="/main-panel/steps/new" className={styles.button}>
          <Add sx={{ mr: 1.5, fontSize: 20 }} />
          Создать новый шаг
        </Link>
        <Link href="/main-panel/days/new" className={styles.button}>
          <Add sx={{ mr: 1.5, fontSize: 20 }} />
          Создать новый день
        </Link>
        <Link href="/main-panel/courses/new" className={styles.button}>
          <Add sx={{ mr: 1.5, fontSize: 20 }} />
          Создать новый курс
        </Link>

        {/* Пункты меню только для админов и модераторов */}
        {(session.user.role === "ADMIN" || session.user.role === "MODERATOR") && (
          <>
            <div className={styles.divider}></div>
            <Link href="/main-panel/users" className={styles.button}>
              <People sx={{ mr: 1.5, fontSize: 20 }} />
              Пользователи платформы
            </Link>
            <Link href="/main-panel/admin" className={styles.button}>
              <AdminPanelSettings sx={{ mr: 1.5, fontSize: 20 }} />
              Администрирование
            </Link>
          </>
        )}
      </aside>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
