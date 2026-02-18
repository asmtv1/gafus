"use client";

import { resetCookieConsent } from "@gafus/ui-components";
import Link from "next/link";
import { memo } from "react";

import styles from "./SettingsActions.module.css";

const SettingsActions = () => {
  return (
    <section className={styles.section}>
      <div className={styles.buttonsContainer}>
        <button
          onClick={() => resetCookieConsent()}
          className={styles.button}
          type="button"
        >
          🍪 Управление cookies
        </button>
        <Link href="/passwordReset" className={styles.button}>
          🔐 Сменить пароль
        </Link>
        <Link href="/profile/change-phone" className={styles.button}>
          📞 Сменить телефон
        </Link>
        <Link href="/profile/change-username" className={styles.button}>
          👤 Сменить логин
        </Link>
      </div>
    </section>
  );
};

export default memo(SettingsActions);
