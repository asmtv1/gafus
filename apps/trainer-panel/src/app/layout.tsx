import { CSRFProvider, CSRFErrorBoundary } from "@gafus/csrf";
import { ErrorBoundary } from "@gafus/error-handling";
import { SessionProvider } from "@shared/providers/SessionProvider";
import { TrainerQueryProvider } from "@shared/providers/QueryProvider";
import React from "react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Панель тренера - Gafus",
  description: "Панель управления тренера для создания курсов и тренировок",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
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
