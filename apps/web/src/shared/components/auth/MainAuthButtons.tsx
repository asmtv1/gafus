"use client";

import { PrimaryButtonLink } from "@shared/components/ui";

import { VkIdOneTap } from "@shared/components/auth/VkIdOneTap";

import styles from "./MainAuthButtons.module.css";

export function MainAuthButtons() {
  return (
    <div className={styles.buttonsContainer}>
      <PrimaryButtonLink href="/login" className={styles.button_login}>
        Войти
      </PrimaryButtonLink>
      <PrimaryButtonLink href="/register" prefetch={false} className={styles.button_register}>
        Регистрация
      </PrimaryButtonLink>
      <VkIdOneTap />
    </div>
  );
}
