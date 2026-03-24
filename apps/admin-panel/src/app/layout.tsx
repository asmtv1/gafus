import { CookieConsentBanner, TracerProvider } from "@gafus/ui-components";
import { ErrorBoundary } from "@gafus/error-handling";
import { SessionProviderWrapper } from "@/features/auth/components/SessionProviderWrapper";
import { CSRFProvider } from "@gafus/csrf";
import { AdminPanelQueryProvider } from "@shared/providers/QueryProvider";

import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Gafus Admin Panel",
  description: "Панель администратора системы Gafus",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <TracerProvider>
          <ErrorBoundary
            config={{
              appName: "admin-panel",
              logToConsole: true,
              showErrorDetails: false,
            }}
          >
            <SessionProviderWrapper>
              <CSRFProvider>
                <AdminPanelQueryProvider>{children}</AdminPanelQueryProvider>
              </CSRFProvider>
            </SessionProviderWrapper>
          </ErrorBoundary>
          <CookieConsentBanner
            cookiePolicyUrl={
              process.env.NEXT_PUBLIC_COOKIES_URL ?? "/cookies.html"
            }
          />
        </TracerProvider>
      </body>
    </html>
  );
}
