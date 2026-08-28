"use client";

import Link from "next/link";

import { VkIdOneTap } from "@shared/components/auth/VkIdOneTap";

import styles from "./MainAuthButtons.module.css";

export function MainAuthButtons() {
  return (
    <div className={styles.buttonsContainer}>
      <Link href="/login" className={styles.button_login}>
        Войти
      </Link>
      <Link href="/register" prefetch={false} className={styles.button_register}>
        Регистрация
      </Link>
      <VkIdOneTap />
    </div>
  );
}
