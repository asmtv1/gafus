
import { SessionProviderWrapper } from "@features/errors/components/SessionProviderWrapper";
import { CSRFProvider } from "@gafus/csrf";
import { ErrorDashboardSWRProvider } from "@shared/providers/SWRProvider";

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
            <ErrorDashboardSWRProvider>{children}</ErrorDashboardSWRProvider>
          </CSRFProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
