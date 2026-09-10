"use client";

import { resetAnalyticsUser, trackEvent } from "@gafus/analytics";
import { ArrowBack, Article as ArticleIcon, Groups as GroupsIcon, Pets as PetsIcon } from "@mui/icons-material";
import { BurgerIcon } from "@shared/components/ui/BurgerIcon";
import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import styles from "./Header.module.css";

import type { HeaderProps } from "../types";

export default React.memo(function Header({ userName, avatarUrl, trainerOnly, partnerOnly }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const isCurrentRoute = useCallback(
    (route: string) => pathname === route || pathname.startsWith(`${route}/`),
    [pathname],
  );

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
      <button className={styles.backButton} type="button" onClick={() => window.history.back()}>
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
              className={`${styles.menuButton} ${isCurrentRoute("/profile") ? styles.menuButtonActive : ""}`}
              href={{ pathname: "/profile", query: { username: userName } }}
              aria-current={isCurrentRoute("/profile") ? "page" : undefined}
              onClick={() => {
                trackMenuClick("tab-profile");
                setMenuOpen(false);
              }}
            >
              <div className={styles.menuIconSlot} aria-hidden="true">
                {userName ? (
                  <Image
                    src={`${avatarUrl}`}
                    alt=""
                    width={24}
                    height={24}
                    className={styles.avatar}
                    priority
                  />
                ) : (
                  <div className={styles.avatarPlaceholder} />
                )}
              </div>
              <span className={styles.menuLabel}>Профиль</span>
            </Link>
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
                <PetsIcon sx={{ fontSize: 24, color: "var(--bg-2, #636128)" }} />
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
                  src="/uploads/header/home.svg"
                  alt=""
                  width={24}
                  height={24}
                  loading="lazy"
                />
              </span>
              <span className={styles.menuLabel}>Курсы</span>
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
                <PetsIcon sx={{ fontSize: 24, color: "var(--bg-2, #636128)" }} />
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
                <ArticleIcon sx={{ fontSize: 24, color: "var(--bg-2, #636128)" }} />
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
                  src="/uploads/header/logout.svg"
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
