"use client";

import { identifyUser, isAnalyticsReady, resetAnalyticsUser } from "@gafus/analytics";
import { useSession } from "next-auth/react";
import { useCallback, useEffect } from "react";

import { ANALYTICS_ENGINE_READY_EVENT } from "./analytics-internal-events";

/**
 * identify/reset по сессии, без логики в AnalyticsProvider (F3).
 */
export default function AnalyticsIdentityBridge() {
  const { data: session, status } = useSession();

  const userId = session?.user?.id;

  const tryIdentify = useCallback(() => {
    if (status === "loading") {
      return;
    }
    if (status === "unauthenticated") {
      resetAnalyticsUser();
      return;
    }
    if (status === "authenticated" && userId && isAnalyticsReady()) {
      identifyUser(userId);
    }
  }, [status, userId]);

  useEffect(() => {
    tryIdentify();
  }, [tryIdentify]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener(ANALYTICS_ENGINE_READY_EVENT, tryIdentify);
    return () => {
      window.removeEventListener(ANALYTICS_ENGINE_READY_EVENT, tryIdentify);
    };
  }, [tryIdentify]);

  return null;
}
