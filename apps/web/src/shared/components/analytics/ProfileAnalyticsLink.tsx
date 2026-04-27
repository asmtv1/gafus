"use client";

import { trackEvent } from "@gafus/analytics";
import Link from "next/link";
import { useCallback } from "react";

interface ProfileAnalyticsLinkProps {
  href: string;
  elementId: string;
  className: string;
  /** Путь экрана для Метрики (передаётся с сервера, т.к. Bio — RSC). */
  pathOrScreen: string;
  children: React.ReactNode;
}

/**
 * Ссылка профиля с явным button_click до перехода (RSC Bio не может вызывать trackEvent).
 */
export function ProfileAnalyticsLink({
  href,
  elementId,
  className,
  pathOrScreen,
  children,
}: ProfileAnalyticsLinkProps) {
  const handleClick = useCallback(() => {
    trackEvent({
      eventName: "button_click",
      platform: "web",
      pathOrScreen,
      elementId,
    });
  }, [elementId, pathOrScreen]);

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
