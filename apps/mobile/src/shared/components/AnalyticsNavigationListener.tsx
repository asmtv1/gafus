import { mobilePerformance } from "@/shared/lib/telemetry/mobilePerformance";
import { trackScreenView } from "@/shared/lib/analytics";
import { usePathname, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { recordDiagnosticNavigation } from "@/shared/lib/telemetry/mobileDiagnosticContext";

/**
 * `page_view` на смене маршрута (F1: не screen_view).
 */
export function AnalyticsNavigationListener() {
  const pathname = usePathname() ?? "/";
  const segments = useSegments();
  const transition=useRef({path:pathname,started:Date.now()});
  if(transition.current.path!==pathname)transition.current={path:pathname,started:Date.now()};
  useEffect(() => {
    recordDiagnosticNavigation(segments);
    const start=transition.current.started;
    const frame=requestAnimationFrame(()=>mobilePerformance.record("SCREEN_READY",Date.now()-start));
    return ()=>cancelAnimationFrame(frame);
  }, [pathname, segments]);

  useEffect(() => {
    trackScreenView({ pathOrScreen: pathname, platform: "mobile" });
  }, [pathname]);

  return null;
}
