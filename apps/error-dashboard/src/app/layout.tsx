
import { SessionProviderWrapper } from "@features/errors/components/SessionProviderWrapper";
import { CSRFProvider } from "@gafus/csrf";
import { ErrorDashboardQueryProvider } from "@shared/providers/QueryProvider";

import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Gafus Error Dashboard",
  description: "Дашборд для мониторинга ошибок в системе Gafus",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-background min-h-screen font-sans antialiased">
        <SessionProviderWrapper>
          <CSRFProvider>
            <ErrorDashboardQueryProvider>{children}</ErrorDashboardQueryProvider>
          </CSRFProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
