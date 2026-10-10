"use client";

import { resetAnalyticsUser, trackEvent } from "@gafus/analytics";
import { Groups as GroupsIcon, PetsOutlined as GafusPawIcon } from "@mui/icons-material";
import { AppBackButton } from "@/shared/components/ui";
import { BurgerIcon } from "@shared/components/ui/BurgerIcon";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import styles from "./Header.module.css";
import { chatApi } from "@/features/cynologist-chat/api";
import { feedApi } from "@/features/feed/api";
import { gafusApi } from "@/features/gafus/api";
import type { CynologistChatStateDto } from "@gafus/consultation-shared";

import type { HeaderProps } from "../types";

export default React.memo(function Header({
  userName,
  avatarUrl: _avatarUrl,
  trainerOnly,
  partnerOnly,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [assignedTrainer, setAssignedTrainer] = useState(false);
  const [feedEnabled, setFeedEnabled] = useState(false);
  const [gafusEnabled, setGafusEnabled] = useState(false);
  const accountId = useSession().data?.user?.id;
  useEffect(() => {
    let active = true;
    setGafusEnabled(false);
    if (accountId) {
      void gafusApi.status().then(result => {
        if (active) setGafusEnabled(result.enabled.economy);
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [accountId]);
  useEffect(() => {
    let active = true;
    setFeedEnabled(false);
    if (accountId) {
      void feedApi.status().then(result => {
        if (active) setFeedEnabled(result.enabled);
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [accountId]);
  useEffect(() => {
    let alive = true;
    setAssignedTrainer(false);
    if (accountId) {
      chatApi<CynologistChatStateDto>()
        .then((state) => {
          if (alive) setAssignedTrainer(state.isAssignedTrainer);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [accountId]);
  const menuRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  const isCurrentRoute = useCallback(
    (route: string) => pathname === route || pathname.startsWith(`${route}/`),
    [pathname],
  );

  const galleryActive = isCurrentRoute("/profile/albums");
  const profileActive = isCurrentRoute("/profile") && !galleryActive;

  const trackMenuClick = useCallback(
    (elementId: string) => {
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen: pathname,
        elementId,
      });
    },
    [pathname],
  );

  useEffect(() => {
    if (!menuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        burgerRef.current &&
        !burgerRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        burgerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  return (
    <header className={styles.container}>
      <AppBackButton onClick={() => window.history.back()}>Назад</AppBackButton>

      <button
        ref={burgerRef}
        className={styles.burgerButton}
        onClick={() => {
          trackMenuClick("tab-menu-toggle");
          setMenuOpen((v) => !v);
        }}
        aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={menuOpen}
      >
        <BurgerIcon active={menuOpen} />
        <span className={styles.burgerLabel} aria-hidden="true">
          Меню
        </span>
      </button>
      {menuOpen && (
        <>
          <div className={styles.overlay} onClick={() => setMenuOpen(false)} />
          <nav className={styles.dropdownMenu} ref={menuRef} aria-label="Навигация">
            <Link
              href="/reminders"
              className={`${styles.menuButton} ${isCurrentRoute("/reminders") ? styles.menuButtonActive : ""}`}
              aria-current={isCurrentRoute("/reminders") ? "page" : undefined}
              onClick={() => {
                trackMenuClick("tab-reminders");
                setMenuOpen(false);
              }}
              onMouseEnter={() => router.prefetch("/reminders")}
            >
              <span className={styles.menuIconSlot} aria-hidden="true">
                <Image src="/images/profile-icons/reminders.webp" alt="" width={32} height={32} />
              </span>
              <span className={styles.menuLabel}>Напоминания о тренировках</span>
            </Link>
            <Link
              className={`${styles.menuButton} ${profileActive ? styles.menuButtonActive : ""}`}
              href={{ pathname: "/profile", query: { username: userName } }}
              aria-current={profileActive ? "page" : undefined}
              onClick={() => {
                trackMenuClick("tab-profile");
                setMenuOpen(false);
              }}
            >
              <div className={styles.menuIconSlot} aria-hidden="true">
                <Image src="/images/tab-icons/profile.webp" alt="" width={32} height={32} />
              </div>
              <span className={styles.menuLabel}>Профиль</span>
            </Link>
            {gafusEnabled && <Link
              href="/gafus"
              className={`${styles.menuButton} ${isCurrentRoute("/gafus") ? styles.menuButtonActive : ""}`}
              aria-current={isCurrentRoute("/gafus") ? "page" : undefined}
              onClick={() => { trackMenuClick("tab-gafus"); setMenuOpen(false); }}
              onMouseEnter={() => router.prefetch("/gafus")}
            >
              <span className={styles.menuIconSlot} aria-hidden="true">
                <GafusPawIcon sx={{ fontSize: 26, color: "var(--bg-2, #636128)" }} />
              </span>
              <span className={styles.menuLabel}>Мои Гафусы</span>
            </Link>}
            {trainerOnly && process.env.NEXT_PUBLIC_TRAINER_PANEL_URL && (
              <Link
                href={process.env.NEXT_PUBLIC_TRAINER_PANEL_URL}
                onClick={() => setMenuOpen(false)}
                className={styles.menuButton}
              >
                <span className={styles.menuIconSlot} aria-hidden="true">
                  <Image
                    src="/uploads/header/trainer-panel.svg"
                    alt=""
                    width={24}
                    height={24}
                    loading="lazy"
                  />
                </span>
                <span className={styles.menuLabel}>Панель тренера</span>
              </Link>
            )}
            {partnerOnly && (
              <Link
                href="/partner"
                onClick={() => {
                  trackMenuClick("tab-partner");
                  setMenuOpen(false);
                }}
                onMouseEnter={() => router.prefetch("/partner")}
                className={`${styles.menuButton} ${isCurrentRoute("/partner") ? styles.menuButtonActive : ""}`}
                aria-current={isCurrentRoute("/partner") ? "page" : undefined}
              >
                <span className={styles.menuIconSlot} aria-hidden="true">
                  <GroupsIcon sx={{ fontSize: 24, color: "var(--bg-2, #636128)" }} />
                </span>
                <span className={styles.menuLabel}>Партнёрская программа</span>
              </Link>
            )}
            <Link
              href="/pets"
              data-tour-target="tab-pets"
              onClick={() => {
                trackMenuClick("tab-pets");
                setMenuOpen(false);
              }}
              onMouseEnter={() => router.prefetch("/pets")}
              className={`${styles.menuButton} ${isCurrentRoute("/pets") ? styles.menuButtonActive : ""}`}
              aria-current={isCurrentRoute("/pets") ? "page" : undefined}
            >
              <span className={styles.menuIconSlot} aria-hidden="true">
                <Image src="/images/tab-icons/pets.webp" alt="" width={32} height={32} />
              </span>
              <span className={styles.menuLabel}>Питомцы</span>
            </Link>
            <Link
              href="/courses"
              onClick={() => {
                trackMenuClick("tab-courses");
                setMenuOpen(false);
              }}
              onMouseEnter={() => router.prefetch("/courses")}
              className={`${styles.menuButton} ${isCurrentRoute("/courses") ? styles.menuButtonActive : ""}`}
              aria-current={isCurrentRoute("/courses") ? "page" : undefined}
            >
              <span className={styles.menuIconSlot} aria-hidden="true">
                <Image
                  src="/images/tab-icons/courses.webp"
                  alt=""
                  width={24}
                  height={24}
                  loading="lazy"
                />
              </span>
              <span className={styles.menuLabel}>Курсы</span>
            </Link>
            <Link
              href={assignedTrainer ? "/cynologist-chats" : "/cynologist-chat"}
              className={`${styles.menuButton} ${isCurrentRoute(assignedTrainer ? "/cynologist-chats" : "/cynologist-chat") ? styles.menuButtonActive : ""}`}
              aria-current={
                isCurrentRoute(assignedTrainer ? "/cynologist-chats" : "/cynologist-chat")
                  ? "page"
                  : undefined
              }
              onClick={() => {
                trackMenuClick("tab-cynologist-chat");
                setMenuOpen(false);
              }}
            >
              <span className={styles.menuIconSlot} aria-hidden="true">
                <Image src="/images/tab-icons/chat.webp" alt="" width={32} height={32} />
              </span>
              <span className={styles.menuLabel}>{assignedTrainer ? "Диалоги" : "Чат"}</span>
            </Link>
            <Link
              href="/profile/albums"
              className={`${styles.menuButton} ${galleryActive ? styles.menuButtonActive : ""}`}
              aria-current={galleryActive ? "page" : undefined}
              onClick={() => {
                trackMenuClick("tab-gallery");
                setMenuOpen(false);
              }}
              onMouseEnter={() => router.prefetch("/profile/albums")}
            >
              <span className={styles.menuIconSlot} aria-hidden="true">
                <Image
                  src="/images/tab-icons/albums.webp"
                  alt=""
                  width={34}
                  height={34}
                  style={{ objectFit: "contain" }}
                />
              </span>
              <span className={styles.menuLabel}>Фотоальбомы</span>
            </Link>
            {feedEnabled && <Link
              href="/feed"
              className={`${styles.menuButton} ${isCurrentRoute("/feed") ? styles.menuButtonActive : ""}`}
              aria-current={isCurrentRoute("/feed") ? "page" : undefined}
              onClick={() => {
                trackMenuClick("tab-feed");
                setMenuOpen(false);
              }}
              onMouseEnter={() => router.prefetch("/feed")}
            >
              <span className={styles.menuIconSlot} aria-hidden="true">
                <Image src="/images/tab-icons/feed.webp" alt="" width={32} height={32} />
              </span>
              <span className={styles.menuLabel}>Моменты</span>
            </Link>}
            <Link href="/questions" className={`${styles.menuButton} ${isCurrentRoute("/questions") ? styles.menuButtonActive : ""}`} aria-current={isCurrentRoute("/questions") ? "page" : undefined} onClick={() => { trackMenuClick("tab-questions"); setMenuOpen(false); }}>
              <span className={styles.menuIconSlot} aria-hidden="true"><Image src="/images/tab-icons/questions.png" alt="" width={32} height={32} style={{ objectFit: "contain" }} /></span>
              <span className={styles.menuLabel}>Вопросы</span>
            </Link>
            <Link
              href="/consultations"
              data-tour-target="tab-consultations"
              onClick={() => {
                trackMenuClick("tab-consultations");
                setMenuOpen(false);
              }}
              onMouseEnter={() => router.prefetch("/consultations")}
              className={`${styles.menuButton} ${isCurrentRoute("/consultations") ? styles.menuButtonActive : ""}`}
              aria-current={isCurrentRoute("/consultations") ? "page" : undefined}
            >
              <span className={styles.menuIconSlot} aria-hidden="true">
                <Image src="/images/tab-icons/cynologist.webp" alt="" width={32} height={32} />
              </span>
              <span className={styles.menuLabel}>Занятия с кинологом</span>
            </Link>
            <Link
              href="/articles"
              onClick={() => {
                trackMenuClick("tab-articles");
                setMenuOpen(false);
              }}
              onMouseEnter={() => router.prefetch("/articles")}
              className={`${styles.menuButton} ${isCurrentRoute("/articles") ? styles.menuButtonActive : ""}`}
              aria-current={isCurrentRoute("/articles") ? "page" : undefined}
            >
              <span className={styles.menuIconSlot} aria-hidden="true">
                <Image src="/images/tab-icons/articles.webp" alt="" width={32} height={32} />
              </span>
              <span className={styles.menuLabel}>Статьи</span>
            </Link>
            <button
              className={`${styles.menuButton} ${styles.logoutMenuItem}`}
              type="button"
              onClick={() => {
                trackMenuClick("tab-logout");
                setMenuOpen(false);
                resetAnalyticsUser();
                signOut({ callbackUrl: "/" });
              }}
            >
              <span className={styles.menuIconSlot} aria-hidden="true">
                <Image
                  src="/images/profile-icons/logout.webp"
                  alt=""
                  width={24}
                  height={24}
                  loading="lazy"
                />
              </span>
              <span className={styles.menuLabel}>Выход</span>
            </button>
          </nav>
        </>
      )}
    </header>
  );
});
