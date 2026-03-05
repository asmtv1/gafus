"use client";

import { resetCookieConsent } from "@gafus/ui-components";
import Link from "next/link";
import { memo } from "react";
import { useSession } from "next-auth/react";

import styles from "./SettingsActions.module.css";

const SettingsActions = () => {
  const { data: session } = useSession();

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
        {session?.user?.passwordSetAt == null ? (
          <Link href="/profile/set-password" className={styles.button}>
            🔐 Установить пароль
          </Link>
        ) : (
          <Link href="/profile/change-password" className={styles.button}>
            🔐 Сменить пароль
          </Link>
        )}
        <Link href="/passwordReset" className={styles.button}>
          Забыли пароль
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
