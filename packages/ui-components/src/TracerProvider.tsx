"use client";

import { memo, useEffect, useRef } from "react";

declare global {
  interface Window {
    __gafusReportError?: (
      error: unknown,
      data?: {
        userId?: string;
        keys?: Record<string, string | number | boolean>;
        severity?: "fatal" | "error" | "warning" | "notice" | "debug";
        issueKey?: string;
      }
    ) => void;
  }
}

interface TracerProviderProps {
  children: React.ReactNode;
}

function TracerProviderInner({ children }: TracerProviderProps) {
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    const token = process.env.NEXT_PUBLIC_TRACER_APP_TOKEN;
    const enabled =
      token &&
      (process.env.NODE_ENV === "production" ||
        process.env.NEXT_PUBLIC_ENABLE_TRACER === "true");

    if (!enabled) return;

    initRef.current = true;
    void (async () => {
      const {
        initTracerError,
        initTracerErrorUploader,
        initTracerSessionUploader,
        initTracerPerformanceWebVitals,
        initTracerPerformanceUploader,
      } = await import("@apptracer/sdk");
      const tracerError = initTracerError();
      const uploaderConfig = {
        appToken: token,
        versionName: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
        environment: process.env.NODE_ENV === "production" ? "prod" : "dev",
      };
      initTracerErrorUploader(uploaderConfig);
      initTracerSessionUploader(uploaderConfig);
      initTracerPerformanceWebVitals({
        webVitalsMetricAttributes: (metric) => ({
          url: typeof window !== "undefined" ? window.location.pathname : "",
        }),
      });
      initTracerPerformanceUploader(uploaderConfig);
      window.__gafusReportError = (error, data) =>
        tracerError.error(error, data);
    })();
  }, []);

  return <>{children}</>;
}

/** Инициализирует Tracer SDK для клиентских ошибок. Только в браузере, production или NEXT_PUBLIC_ENABLE_TRACER=true */
export const TracerProvider = memo(TracerProviderInner);
