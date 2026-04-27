"use client";

import { sanitizePath, trackScreenView } from "@gafus/analytics";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * page_view на смене маршрута; pathOrScreen с allowlisted query (F6).
 */
export default function NavigationAnalytics() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  /** Стабильная строка query — объект searchParams часто меняет ссылку без смены URL. */
  const searchQueryKey = searchParams.toString();

  useEffect(() => {
    const pathOrScreen = sanitizePath(pathname, searchParams);
    trackScreenView({ pathOrScreen, platform: "web" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams нестабилен; смена query отражена в searchQueryKey.
  }, [pathname, searchQueryKey]);

  return null;
}
