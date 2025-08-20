import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  applicationName: "Гафус",
  description: "Пошаговые тренировки собак онлайн",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Гафус", statusBarStyle: "default" },
};
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
