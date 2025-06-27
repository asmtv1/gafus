import type { Metadata } from "next";
import "../globals.css";
import Footer from "@/components/Footer/FooterClient";

import HeaderServerWrapper from "@/components/Header/HeaderServerWrapper";

export const metadata: Metadata = {
  title: { default: "Гафус", template: "%s — Гафус" },
  applicationName: "Гафус",
  description: "Пошаговые тренировки собак онлайн",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Гафус", statusBarStyle: "default" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HeaderServerWrapper />
      {children}
      <Footer />
    </>
  );
}
