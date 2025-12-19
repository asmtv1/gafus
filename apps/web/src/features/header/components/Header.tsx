"use client";

import { BurgerIcon } from "@shared/components/ui/BurgerIcon";
import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

import styles from "./Header.module.css";

import type { HeaderProps } from "@gafus/types";

export default React.memo(function Header({ userName, avatarUrl, trainerOnly }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

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
        ← Назад
      </button>

      <button
        ref={burgerRef}
        className={styles.burgerButton}
        onClick={() => setMenuOpen((v) => !v)}
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
              onClick={() => setMenuOpen(false)}
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
            <Link
                  href="/achievements/"
                  onClick={() => setMenuOpen(false)}
                  className={styles.menuButton}
                >
                  <Image
                    src="/uploads/header/achievements.svg"
                    alt="achievements"
                    width={24}
                    height={24}
                    loading="lazy"
                  />
                  Достижения
                </Link>
            {trainerOnly && (
              <>
                {process.env.NEXT_PUBLIC_TRAINER_PANEL_URL && (
                  <Link
                    href={process.env.NEXT_PUBLIC_TRAINER_PANEL_URL}
                    onClick={() => setMenuOpen(false)}
                    className={styles.menuButton}
                  >
                    <Image
                      src="/uploads/header/trainer-panel.svg"
                      alt="statistics"
                      width={24}
                      height={24}
                      loading="lazy"
                    />
                    Панель тренера
                  </Link>
                )}
              </>
            )}
            <Link 
              href="/courses" 
              onClick={() => setMenuOpen(false)} 
              onMouseEnter={() => router.prefetch("/courses")}
              className={styles.menuButton}
            >
              <Image src="/uploads/header/home.svg" alt="Home" width={24} height={24} loading="lazy" />
              Все курсы
            </Link>
            <Link
              href="/favorites"
              onClick={() => setMenuOpen(false)}
              onMouseEnter={() => router.prefetch("/favorites")}
              className={styles.menuButton}
            >
              <Image
                src="/uploads/header/favorites.svg"
                alt="favorites"
                width={24}
                height={24}
                loading="lazy"
              />
              Избранное
            </Link>
            <div className={styles.menuButton}>
              <Image src="/uploads/header/logout.svg" alt="Logout" width={24} height={24} loading="lazy" />
              <button
                className={styles.logoutButton}
                onClick={() => {
                  setMenuOpen(false);
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
