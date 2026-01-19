"use client";

import Link from "next/link";
import { memo } from "react";

import styles from "./SettingsActions.module.css";

const SettingsActions = () => {
  return (
    <section className={styles.section}>
      <div className={styles.buttonsContainer}>
        <Link href="/passwordReset" className={styles.button}>
          🔐 Сменить пароль
        </Link>
      </div>
    </section>
  );
};

export default memo(SettingsActions);

