import { trackScreenView } from "@/shared/lib/analytics";
import { setTracerScreen } from "@/shared/lib/tracer";
import { usePathname } from "expo-router";
import { useEffect } from "react";

/**
 * `page_view` на смене маршрута (F1: не screen_view).
 */
export function AnalyticsNavigationListener() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    trackScreenView({ pathOrScreen: pathname, platform: "mobile" });
    setTracerScreen(pathname);
  }, [pathname]);

  return null;
}
