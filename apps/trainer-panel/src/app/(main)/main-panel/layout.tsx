// apps/trainer-panel/src/app/(main)/main-panel/layout.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { 
  FitnessCenter, 
  Schedule, 
  Add,
  TrendingUp,
  Assignment,
  AutoStories,
  Menu as MenuIcon,
  Close as CloseIcon,
  Logout
} from "@mui/icons-material";
import { useState, useEffect } from "react";

import styles from "./main-panel.module.css";

interface MainPanelLayoutProps {
  children: React.ReactNode;
}

export default function MainPanelLayout({ children }: MainPanelLayoutProps) {
  const { data: session, status } = useSession();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pendingExamCount, setPendingExamCount] = useState(0);

  const userName = session?.user?.username;
  const avatarUrl = session?.user?.avatarUrl ?? "/uploads/avatar.svg";

  // Загружаем количество непроверенных экзаменов
  useEffect(() => {
    async function loadPendingCount() {
      try {
        const response = await fetch("/api/exam-results/pending-count");
        if (response.ok) {
          const data = await response.json();
          setPendingExamCount(data.count || 0);
        }
      } catch (error) {
        console.error("Failed to load pending exam count:", error);
      }
    }
    loadPendingCount();
  }, []);

  // Показываем скелетон при загрузке сессии
  if (status === "loading") {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
      </div>
    );
  }

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    closeMobileMenu();
    await signOut({ redirect: true, callbackUrl: "/login" });
  };

  return (
    <div className={styles.container}>
      {/* Мобильная шапка с кнопкой меню */}
      <div className={styles.mobileHeader}>
        <button 
          className={styles.menuButton} 
          onClick={toggleMobileMenu}
          aria-label="Открыть меню"
        >
          {isMobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
        <div className={styles.mobileHeaderUser}>
          <span className={styles.mobileUserName}>{userName}</span>
          <Image
            src={avatarUrl}
            alt="Avatar"
            width={32}
            height={32}
            className={styles.mobileAvatar}
          />
        </div>
      </div>

      {/* Оверлей для закрытия меню на мобилке */}
      {isMobileMenuOpen && (
        <div className={styles.overlay} onClick={closeMobileMenu}></div>
      )}

      {/* Боковая панель */}
      <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.profilWrapper}>
          <div className={styles.userName}>{userName || "\u00A0"}</div>
          <Image
            src={avatarUrl}
            alt="Avatar"
            width={48}
            height={48}
            className={styles.avatar}
          />
        </div>
        <Link 
          href="/main-panel/statistics" 
          className={styles.button}
          onClick={closeMobileMenu}
        >
          <TrendingUp sx={{ mr: 1.5, fontSize: 20 }} />
          Общая Статистика
        </Link>
        <Link 
          href="/main-panel/steps" 
          className={styles.button}
          onClick={closeMobileMenu}
        >
          <FitnessCenter sx={{ mr: 1.5, fontSize: 20 }} />
          Созданные шаги
        </Link>
        <Link 
          href="/main-panel/days" 
          className={styles.button}
          onClick={closeMobileMenu}
        >
          <Schedule sx={{ mr: 1.5, fontSize: 20 }} />
          Созданные дни
        </Link>
        <Link 
          href="/main-panel/templates" 
          className={styles.button}
          onClick={closeMobileMenu}
        >
          <AutoStories sx={{ mr: 1.5, fontSize: 20 }} />
          Библиотека шаблонов
        </Link>
        <Link 
          href="/main-panel/exam-results" 
          className={styles.button}
          onClick={closeMobileMenu}
        >
          <Assignment sx={{ mr: 1.5, fontSize: 20 }} />
          Результаты экзаменов
          {pendingExamCount > 0 && (
            <span className={styles.badge}>
              {pendingExamCount}
            </span>
          )}
        </Link>
        
        <div className={styles.divider}></div>
        
        <Link 
          href="/main-panel/steps/new" 
          className={styles.button}
          onClick={closeMobileMenu}
        >
          <Add sx={{ mr: 1.5, fontSize: 20 }} />
          Создать новый шаг
        </Link>
        <Link 
          href="/main-panel/days/new" 
          className={styles.button}
          onClick={closeMobileMenu}
        >
          <Add sx={{ mr: 1.5, fontSize: 20 }} />
          Создать новый день
        </Link>
        <Link 
          href="/main-panel/courses/new" 
          className={styles.button}
          onClick={closeMobileMenu}
        >
          <Add sx={{ mr: 1.5, fontSize: 20 }} />
          Создать новый курс
        </Link>

        <div className={styles.divider}></div>

        <button 
          className={styles.logoutButton}
          onClick={handleLogout}
        >
          <Logout sx={{ mr: 1.5, fontSize: 20 }} />
          Выход
        </button>
      </aside>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
