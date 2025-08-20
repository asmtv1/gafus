// app/layout.tsx

import type { Metadata } from "next";

import "../globals.css";

import NotificationRequesterNew from "@shared/components/ui/NotificationRequesterNew";
import OfflineStatus from "@shared/components/ui/OfflineStatus";
import OfflineStoreInitializer from "@shared/components/ui/OfflineStoreInitializer";

import Footer from "@/features/footer/components/Footer";
import HeaderServerWrapper from "@/features/header/components/HeaderServerWrapper";

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
        <OfflineStatus />
        <OfflineStoreInitializer />
        <main style={{ flex: 1 }}>{children}</main>
        <Footer />
      </div>
    </>
  );
}
