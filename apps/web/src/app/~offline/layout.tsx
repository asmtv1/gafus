"use client";

import "../globals.css";
import NotificationRequesterNew from "@shared/components/ui/NotificationRequesterNew";
import OfflineStatus from "@shared/components/ui/OfflineStatus";
import OfflineStoreInitializer from "@shared/components/ui/OfflineStoreInitializer";
import OfflineDetector from "@shared/components/ui/OfflineDetector";
import ServiceWorkerRegistrar from "@shared/components/ui/ServiceWorkerRegistrar";
import Footer from "@/features/footer/components/Footer";
import Header from "@/features/header/components/Header";

// Клиентский layout для страницы офлайна
// Используем клиентский Header вместо серверного, чтобы избежать ошибок в офлайне
export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="page-container">
        <Header userName="" avatarUrl="/uploads/avatar.svg" trainerOnly={false} />
        <ServiceWorkerRegistrar />
        <NotificationRequesterNew />
        <OfflineStatus />
        <OfflineStoreInitializer />
        <OfflineDetector />
        <main style={{ flex: 1 }}>{children}</main>
        <Footer />
      </div>
    </>
  );
}
