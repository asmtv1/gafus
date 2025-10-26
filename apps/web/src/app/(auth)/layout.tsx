import type { Metadata } from "next";
import { SITE_CONFIG } from "@gafus/metadata";
import "../globals.css";

export const metadata: Metadata = {
  applicationName: SITE_CONFIG.name,
  description: SITE_CONFIG.description,
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: SITE_CONFIG.name, statusBarStyle: "default" },
};
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
