import { CSRFProvider, CSRFErrorBoundary } from "@gafus/csrf";
import { ErrorBoundary } from "@gafus/error-handling";
import { SessionProvider } from "@shared/providers/SessionProvider";
import { TrainerQueryProvider } from "@shared/providers/QueryProvider";
import React from "react";
import "./globals.css";

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Панель тренера - Gafus",
  description: "Панель управления тренера для создания курсов и тренировок",
  applicationName: "Панель тренера",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Панель тренера",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#8936FF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#8936FF" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" sizes="180x180" href="/uploads/icons/icon180.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/uploads/icons/icon192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/uploads/icons/icon512_rounded.png" />
      </head>
      <body>
        <ErrorBoundary
          config={{
            appName: "trainer-panel",
            environment:
              (process.env.NODE_ENV as "development" | "production" | "staging") || "development",
            logToConsole: true,
            showErrorDetails: false, // Не показываем детали пользователям
          }}
        >
          <SessionProvider>
            <CSRFProvider autoInitialize={true} logErrors={true} maxRetries={3} retryDelay={1000}>
              <CSRFErrorBoundary>
                <TrainerQueryProvider>{children}</TrainerQueryProvider>
              </CSRFErrorBoundary>
            </CSRFProvider>
          </SessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
