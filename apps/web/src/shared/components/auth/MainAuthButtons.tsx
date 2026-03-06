"use client";

import Link from "next/link";

import { VkIdOneTap } from "@shared/components/auth/VkIdOneTap";

import styles from "./MainAuthButtons.module.css";

export function MainAuthButtons() {
  return (
    <div className={styles.buttonsContainer}>
      <Link href="/login">
        <button className={styles.button_login} type="button">
          войти
        </button>
      </Link>
      <Link href="/register" prefetch={false}>
        <button className={styles.button_register} type="button">
          регистрация
        </button>
      </Link>
      <VkIdOneTap />
    </div>
  );
}
