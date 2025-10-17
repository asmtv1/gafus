
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
        <SessionProviderWrapper>
          <CSRFProvider>
            <AdminPanelQueryProvider>{children}</AdminPanelQueryProvider>
          </CSRFProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}

