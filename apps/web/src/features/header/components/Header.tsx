"use client";

import { resetAnalyticsUser, trackEvent } from "@gafus/analytics";
import { ArrowBack, Article as ArticleIcon, Pets as PetsIcon } from "@mui/icons-material";
import { BurgerIcon } from "@shared/components/ui/BurgerIcon";
import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import styles from "./Header.module.css";

import type { HeaderProps } from "../types";

export default React.memo(function Header({ userName, avatarUrl, trainerOnly }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const pathname = usePathname() ?? "/";

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

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <header className={styles.container}>
      <button className={styles.backButton} onClick={() => window.history.back()}>
        <ArrowBack aria-hidden="true" className={styles.backIcon} />
        Назад
      </button>

      <button
        ref={burgerRef}
        className={styles.burgerButton}
        onClick={() => {
          trackMenuClick("tab-menu-toggle");
          setMenuOpen((v) => !v);
        }}
        aria-label="Открыть меню"
      >
        <BurgerIcon active={menuOpen} />
      </button>
      {menuOpen && (
        <>
          <div className={styles.overlay} onClick={() => setMenuOpen(false)} />
          <nav className={styles.dropdownMenu} ref={menuRef}>
            <Link
              className={styles.menuButton}
              href={{ pathname: "/profile", query: { username: userName } }}
              onClick={() => {
                trackMenuClick("tab-profile");
                setMenuOpen(false);
              }}
            >
              <div className={styles.avatarWrapper}>
                {userName ? (
                  <Image
                    src={`${avatarUrl}`}
                    alt="Avatar"
                    width={24}
                    height={24}
                    className={styles.avatar}
                    priority
                  />
                ) : (
                  <div className={styles.avatarPlaceholder} />
                )}
              </div>
              <div className={styles.profiltext}>Профиль</div>
            </Link>
            {trainerOnly && process.env.NEXT_PUBLIC_TRAINER_PANEL_URL && (
              <Link
                href={process.env.NEXT_PUBLIC_TRAINER_PANEL_URL}
                onClick={() => setMenuOpen(false)}
                className={styles.menuButton}
              >
                <Image
                  src="/uploads/header/trainer-panel.svg"
                  alt="Панель тренера"
                  width={24}
                  height={24}
                  loading="lazy"
                />
                Панель тренера
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
              className={styles.menuButton}
            >
              <PetsIcon sx={{ fontSize: 24, color: "var(--bg-2, #636128)" }} />
              Питомцы
            </Link>
            <Link
              href="/courses"
              onClick={() => {
                trackMenuClick("tab-courses");
                setMenuOpen(false);
              }}
              onMouseEnter={() => router.prefetch("/courses")}
              className={styles.menuButton}
            >
              <Image
                src="/uploads/header/home.svg"
                alt="Курсы"
                width={24}
                height={24}
                loading="lazy"
              />
              Курсы
            </Link>
            <Link
              href="/consultations"
              data-tour-target="tab-consultations"
              onClick={() => {
                trackMenuClick("tab-consultations");
                setMenuOpen(false);
              }}
              onMouseEnter={() => router.prefetch("/consultations")}
              className={styles.menuButton}
            >
              <PetsIcon sx={{ fontSize: 24, color: "var(--bg-2, #636128)" }} />
              Занятия с кинологом
            </Link>
            <Link
              href="/articles"
              onClick={() => {
                trackMenuClick("tab-articles");
                setMenuOpen(false);
              }}
              onMouseEnter={() => router.prefetch("/articles")}
              className={styles.menuButton}
            >
              <ArticleIcon sx={{ fontSize: 24, color: "var(--bg-2, #636128)" }} />
              Статьи
            </Link>
            <div className={styles.menuButton}>
              <Image
                src="/uploads/header/logout.svg"
                alt="Logout"
                width={24}
                height={24}
                loading="lazy"
              />
              <button
                className={styles.logoutButton}
                onClick={() => {
                  trackMenuClick("tab-logout");
                  setMenuOpen(false);
                  resetAnalyticsUser();
                  signOut({ callbackUrl: "/" });
                }}
              >
                Выход
              </button>
            </div>
          </nav>
        </>
      )}
    </header>
  );
});
