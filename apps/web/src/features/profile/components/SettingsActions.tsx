"use client";

import Link from "next/link";

import styles from "./SettingsActions.module.css";

export default function SettingsActions() {
  return (
    <section className={styles.section}>
      <div className={styles.buttonsContainer}>
        <Link href="/passwordReset" className={styles.button}>
          🔐 Сменить пароль
        </Link>
      </div>
    </section>
  );
}

