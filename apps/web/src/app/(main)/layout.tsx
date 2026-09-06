// app/layout.tsx

import type { Metadata } from "next";

import "../globals.css";

import NotificationRequesterNew from "@shared/components/ui/NotificationRequesterNew";
import WebSyncInitializer from "@shared/components/ui/WebSyncInitializer";

import { Footer } from "@/features/footer";
import { HeaderServerWrapper } from "@/features/header";

export const metadata: Metadata = {
  title: { default: "Гафус", template: "%s — Гафус" },
  applicationName: "Гафус",
  description: "Пошаговые тренировки собак онлайн",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Гафус", statusBarStyle: "default" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="page-container">
        <HeaderServerWrapper />
        <NotificationRequesterNew />
        <WebSyncInitializer />
        <main style={{ flex: 1 }}>{children}</main>
        <Footer />
      </div>
    </>
  );
}
