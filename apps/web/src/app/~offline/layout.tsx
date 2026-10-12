"use client";

import "../globals.css";
import NotificationRequesterNew from "@shared/components/ui/NotificationRequesterNew";
import { Footer } from "@/features/footer";
import { Header } from "@/features/header/client";

// Клиентский layout для страницы офлайна
// Используем клиентский Header вместо серверного, чтобы избежать ошибок в офлайне
export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="page-container">
        <Header userName="" avatarUrl="/uploads/avatar.svg" trainerOnly={false} partnerOnly={false} />
        <NotificationRequesterNew />
        <main style={{ flex: 1 }}>{children}</main>
        <Footer />
      </div>
    </>
  );
}
