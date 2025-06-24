"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "./Header.module.css";
import React from "react";
import { signOut } from "next-auth/react";
import { BurgerIcon } from "../ui/BurgerIcon";
import NotificationRequester from "../ui/NotificationRequester";

interface HeaderProps {
  userName: string;
  avatarUrl: string;
}

export default React.memo(function Header({
  userName,
  avatarUrl,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);

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
    <header className={styles.header}>
      <button
        className={styles.backButton}
        onClick={() => window.history.back()}
      >
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
        <nav className={styles.dropdownMenu} ref={menuRef}>
          <Link
            className={styles.profil}
            href={{ pathname: "/profile", query: { username: userName } }}
            onClick={() => setMenuOpen(false)}
          >
            Профиль
            <div className={styles.userName}>{userName || "\u00A0"}</div>
            <div className={styles.avatar}>
              {userName ? (
                <Image
                  src={avatarUrl}
                  alt="Avatar"
                  width={32}
                  height={32}
                  priority
                />
              ) : (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    backgroundColor: "#ccc",
                    borderRadius: "50%",
                  }}
                />
              )}
            </div>
          </Link>
          <Link href="/courses" onClick={() => setMenuOpen(false)}>
            Все Курсы
            <Image src="/home.svg" alt="Home" width={24} height={24} />
          </Link>
          <Link href="/favorites/" onClick={() => setMenuOpen(false)}>
            Избранные курсы
            <Image
              src="/bookmarks.svg"
              alt="Bookmarks"
              width={24}
              height={24}
            />
          </Link>
          <NotificationRequester />
          <button
            onClick={() => {
              setMenuOpen(false);
              signOut({ callbackUrl: "/" });
            }}
          >
            Выход
            <Image src="/logout.svg" alt="Logout" width={24} height={24} />
          </button>
        </nav>
      )}
    </header>
  );
});
