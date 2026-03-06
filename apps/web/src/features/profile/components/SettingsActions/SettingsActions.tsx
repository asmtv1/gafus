"use client";

import { resetCookieConsent } from "@gafus/ui-components";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { initiateVkIdLink } from "@shared/server-actions";

import styles from "./SettingsActions.module.css";

const LINK_SUCCESS_DISMISS_MS = 7000; // 7 секунд

interface SettingsActionsProps {
  hasVkLinked?: boolean;
  linkFeedback?: string;
}

const SettingsActions = ({ hasVkLinked = false, linkFeedback }: SettingsActionsProps) => {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (linkFeedback !== "vk") return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("linked");
      const newSearch = params.toString();
      router.replace(newSearch ? `${pathname}?${newSearch}` : pathname, { scroll: false });
    }, LINK_SUCCESS_DISMISS_MS);
    return () => clearTimeout(t);
  }, [linkFeedback, router, pathname, searchParams]);

  const handleLinkVk = async () => {
    setIsLinking(true);
    setLinkError(null);
    const result = await initiateVkIdLink();
    if (result.success) {
      window.location.href = result.url;
    } else {
      setLinkError(result.error);
      setIsLinking(false);
    }
  };

  return (
    <section className={styles.section}>
      {linkFeedback === "vk" && (
        <div className={styles.successBanner}>VK успешно подключён</div>
      )}
      {linkFeedback && linkFeedback !== "vk" && (
        <div className={styles.errorBanner}>{linkFeedback}</div>
      )}
      <div className={styles.buttonsContainer}>
        {!hasVkLinked ? (
          <button
            onClick={handleLinkVk}
            disabled={isLinking}
            className={styles.button}
            type="button"
          >
            {isLinking ? "Подключение..." : "🔗 Подключить VK"}
          </button>
        ) : (
          <span className={styles.infoText}>✅ VK подключён</span>
        )}
        {linkError && <p className={styles.errorText}>{linkError}</p>}
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
        {session?.user?.passwordSetAt != null && (
          <Link href="/passwordReset" className={styles.button}>
            Забыли пароль
          </Link>
        )}
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
