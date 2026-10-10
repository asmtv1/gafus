"use client";

import { reportClientError } from "@gafus/error-handling";
import { resetCookieConsent } from "@gafus/ui-components";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { resetAnalyticsUser } from "@gafus/analytics";
import { ProfileIcon, type ProfileIconName } from "../ProfileIcon";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useWebOnboardingTourStore } from "@/features/onboarding-tour";

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
  const linking = useRef(false);
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const startTour = useWebOnboardingTourStore((state) => state.startTour);

  useEffect(() => {
    if (linkFeedback !== "vk" && linkFeedback !== "emailChangeSent") return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (linkFeedback === "vk") {
        params.delete("linked");
      }
      if (linkFeedback === "emailChangeSent") {
        params.delete("emailChange");
      }
      const newSearch = params.toString();
      router.replace(newSearch ? `${pathname}?${newSearch}` : pathname, { scroll: false });
    }, LINK_SUCCESS_DISMISS_MS);
    return () => clearTimeout(t);
  }, [linkFeedback, router, pathname, searchParams]);

  const handleLinkVk = async () => {
    if (linking.current) return;
    linking.current = true;
    setIsLinking(true);
    setLinkError(null);
    try {
      const result = await initiateVkIdLink();
      if (result.success) {
        window.location.href = result.url;
      } else {
        setLinkError(result.error);
        linking.current = false;
        setIsLinking(false);
      }
    } catch (error) {
      reportClientError(error, { issueKey: "SettingsActions", keys: { operation: "link_vk" } });
      linking.current = false;
      setLinkError("Не удалось подключить VK. Попробуйте ещё раз.");
      setIsLinking(false);
    }
  };

  const handleRestartTour = () => {
    startTour();
  };

  return (
    <section className={styles.section}>
      {linkFeedback === "vk" && (
        <div className={styles.successBanner}>
          <CheckCircleIcon className={styles.successIcon} />
          <span>VK подключён</span>
        </div>
      )}
      {linkFeedback === "emailChangeSent" && (
        <div className={styles.successBanner}>
          <CheckCircleIcon className={styles.successIcon} />
          <span>Письмо отправлено — проверьте новый email</span>
        </div>
      )}
      {linkFeedback && linkFeedback !== "vk" && linkFeedback !== "emailChangeSent" && (
        <div className={styles.errorBanner}>{linkFeedback}</div>
      )}
      <div className={styles.buttonsContainer}>
        <h2 className={styles.groupTitle}>Настройки</h2>
        <button type="button" className={styles.row} onClick={handleRestartTour}>
          <ProfileIcon name="tour" />
          <span>Повторить экскурсию</span>
          <span aria-hidden="true">›</span>
        </button>
        {!hasVkLinked ? (
          <button
            type="button"
            className={styles.row}
            onClick={() => void handleLinkVk()}
            disabled={isLinking}
          >
            <ProfileIcon name="login" />
            <span>{isLinking ? "Подключение…" : "Подключить VK"}</span>
            <span aria-hidden="true">›</span>
          </button>
        ) : (
          <div className={styles.vkLinkedBadge}>
            <CheckCircleIcon className={styles.successIcon} />
            <span>VK подключён</span>
          </div>
        )}
        {linkError && (
          <p className={styles.errorText} role="alert">
            {linkError}
          </p>
        )}
        <h2 className={styles.groupTitle}>Данные аккаунта</h2>
        <Link href="/profile/change-username" className={styles.row}>
          <ProfileIcon name="login" />
          <span>
            Логин<small>{session?.user?.username}</small>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
        <Link href="/profile/change-email" className={styles.row}>
          <ProfileIcon name="email" />
          <span>
            Email<small>{session?.user?.email || "Укажите email для восстановления доступа"}</small>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
        <Link
          href={
            session?.user?.passwordSetAt == null
              ? "/profile/set-password"
              : "/profile/change-password"
          }
          className={styles.row}
        >
          <ProfileIcon name="password" />
          <span>
            {session?.user?.passwordSetAt == null ? "Установить пароль" : "Сменить пароль"}
          </span>
          <span aria-hidden="true">›</span>
        </Link>
        {session?.user?.passwordSetAt != null && (
          <Link href="/passwordReset" className={styles.row}>
            <ProfileIcon name="password" />
            <span>Забыли пароль</span>
            <span aria-hidden="true">›</span>
          </Link>
        )}
        <h2 className={styles.groupTitle}>Информация</h2>
        {(
          [
            ["app-info", "/", "О приложении"],
            ["telegram", "https://t.me/gafusRu", "Наш Telegram"],
            ["privacy", "/policy.html", "Политика конфиденциальности"],
            ["offer", "/oferta.html", "Оферта"],
            ["consent", "/personal.html", "Согласие на обработку персональных данных"],
            ["distribution", "/personal-distribution.html", "Согласие на распространение данных"],
            ["support", "https://t.me/gafus_support", "Связаться с поддержкой"],
          ] as [ProfileIconName, string, string][]
        ).map(([icon, href, label]) => (
          <a
            key={icon}
            href={href}
            className={styles.row}
            {...(href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            <ProfileIcon name={icon} />
            <span>{label}</span>
            <span aria-hidden="true">›</span>
          </a>
        ))}
        <button type="button" className={styles.row} onClick={() => resetCookieConsent()}>
          <ProfileIcon name="privacy" />
          <span>Управление cookies</span>
          <span aria-hidden="true">›</span>
        </button>
        <h2 className={styles.groupTitle}>Действия с аккаунтом</h2>
        <button
          type="button"
          className={styles.row}
          onClick={() => {
            resetAnalyticsUser();
            void signOut({ callbackUrl: "/" });
          }}
        >
          <ProfileIcon name="logout" />
          <span>Выйти из аккаунта</span>
        </button>
        <Link href="/profile/delete-account" className={`${styles.row} ${styles.dangerRow}`}>
          <ProfileIcon name="delete-account" />
          <span>Удалить аккаунт</span>
          <span aria-hidden="true">›</span>
        </Link>
      </div>
    </section>
  );
};

export default memo(SettingsActions);
