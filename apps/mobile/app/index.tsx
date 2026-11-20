import { Redirect, type Href } from "expo-router";

import { useAuthStore } from "@/shared/stores";
import { readMobileIntroState } from "@/shared/lib/mobile-intro-state";
import * as Application from "expo-application";
import { useEffect, useState } from "react";

/**
 * Корневой маршрут — мгновенный редирект по auth состоянию.
 * Рендерится только когда AuthProvider уже завершил checkAuth.
 */
export default function Index() {
  const [introFinished, setIntroFinished] = useState<boolean | null>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    let active = true;
    void Promise.all([
      readMobileIntroState(),
      Application.getInstallationTimeAsync().catch(() => null),
    ]).then(([state, installedAt]) => {
      const existingInstall = installedAt
        ? installedAt.getTime() < Date.parse("2026-09-17T00:00:00Z") : true;
      if (active) setIntroFinished(state.finished || existingInstall);
    }).catch(() => {
      // Storage failure must not trap the user on an empty startup screen.
      if (active) setIntroFinished(true);
    });
    return () => { active = false; };
  }, []);

  if (introFinished === false && !isAuthenticated) return <Redirect href={"/(auth)/intro" as Href} />;

  if (isAuthenticated) return <Redirect href="/(main)/(tabs)" />;
  if (introFinished === null) return null;
  return <Redirect href="/welcome" />;
}
