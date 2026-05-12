"use client";

import { trackEvent } from "@gafus/analytics";
import Link from "next/link";
import { useCallback } from "react";
import type { AnchorHTMLAttributes } from "react";

interface ProfileAnalyticsLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
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
  ...rest
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
    <Link href={href} className={className} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
