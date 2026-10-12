// src/app/layout.tsx

import { ErrorBoundary } from "@gafus/error-handling";
import { TracerProvider } from "@gafus/ui-components";
import { SITE_CONFIG, DEFAULT_OG_IMAGE, SOCIAL } from "@gafus/metadata";
import BfCacheReloadOnRestore from "@shared/components/auth/BfCacheReloadOnRestore";
import { VkIdTokenHandler } from "@shared/components/auth/VkIdTokenHandler";
import PetsProvider from "@shared/components/common/PetsProvider";
import UserProvider from "@shared/components/common/UserProvider";
import ClientLayout from "@shared/components/ui/ClientLayout";
import SessionWrapper from "@shared/components/ui/SessionWrapper";
import { WebQueryProvider } from "@shared/providers/QueryProvider";
import { WebOnboardingTourProvider } from "@/features/onboarding-tour";

import localFont from "next/font/local";
import type { Metadata, Viewport } from "next";

import { Suspense } from "react";

import { ClientRedirect } from "./ClientRedirect";
import "./globals.css";
import "./normalize.css";
import "./tokens.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.url),
  title: { default: SITE_CONFIG.title, template: `%s — ${SITE_CONFIG.name}` },
  description: SITE_CONFIG.description,
  applicationName: SITE_CONFIG.name,
  alternates: { canonical: "/" },
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon192.png",
  },
  openGraph: {
    type: "website",
    url: SITE_CONFIG.url,
    siteName: SITE_CONFIG.name,
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
    images: [DEFAULT_OG_IMAGE],
    locale: SITE_CONFIG.locale,
  },
  twitter: {
    card: SOCIAL.twitterCard,
    title: SITE_CONFIG.title,
    description: SITE_CONFIG.description,
    images: [DEFAULT_OG_IMAGE.url],
  },
  appleWebApp: { capable: true, title: SITE_CONFIG.name, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: SITE_CONFIG.themeColor,
};

// Bundled SIL OFL Montserrat prevents production builds from depending on Google Fonts.
const montserrat = localFont({
  src: [
    { path: "./fonts/montserrat/Montserrat-100.ttf", weight: "100", style: "normal" },
    { path: "./fonts/montserrat/Montserrat-200.ttf", weight: "200", style: "normal" },
    { path: "./fonts/montserrat/Montserrat-300.ttf", weight: "300", style: "normal" },
    { path: "./fonts/montserrat/Montserrat-400.ttf", weight: "400", style: "normal" },
    { path: "./fonts/montserrat/Montserrat-500.ttf", weight: "500", style: "normal" },
    { path: "./fonts/montserrat/Montserrat-600.ttf", weight: "600", style: "normal" },
    { path: "./fonts/montserrat/Montserrat-700.ttf", weight: "700", style: "normal" },
    { path: "./fonts/montserrat/Montserrat-800.ttf", weight: "800", style: "normal" },
    { path: "./fonts/montserrat/Montserrat-900.ttf", weight: "900", style: "normal" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-montserrat",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={montserrat.variable}>
      <head>
        <link rel="stylesheet" href="/styles/site-background.css" />
        <link rel="manifest" href="/manifest.json" />
        {/* 
        Для разных страниц можно задавать разную тему, если использовать объект viewport или metadata на уровне каждой страницы (page.tsx) или layout.tsx в соответствующей папке.
        Например, в page.tsx:
        export const viewport = { themeColor: "#DAD3C1" }
        Тогда Next.js сам добавит нужный <meta name="theme-color" ... /> для этой страницы.
        Здесь оставляем дефолтную тему для всего приложения:
      */}
        <meta name="theme-color" content={SITE_CONFIG.themeColor} />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" sizes="180x180" href="/uploads/icons/icon180.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/uploads/icons/icon192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/uploads/icons/icon512_rounded.png" />

        {/* DNS prefetch для внешних ресурсов */}
        <link rel="dns-prefetch" href="//res.cloudinary.com" />

        {/* Preconnect для критических доменов */}
        <link rel="preconnect" href="https://res.cloudinary.com" />
      </head>
      <body>
        <TracerProvider>
          <ErrorBoundary
            config={{
              appName: "gafus",
              logToConsole: true,
              showErrorDetails: false,
            }}
          >
            <ClientLayout>
              <SessionWrapper>
                <BfCacheReloadOnRestore />
                <ClientRedirect />
                <Suspense fallback={null}>
                  <VkIdTokenHandler />
                </Suspense>
                <UserProvider>
                  <PetsProvider>
                    <WebQueryProvider>
                      <WebOnboardingTourProvider>
                        <main>{children}</main>
                      </WebOnboardingTourProvider>
                    </WebQueryProvider>
                  </PetsProvider>
                </UserProvider>
              </SessionWrapper>
            </ClientLayout>
          </ErrorBoundary>
        </TracerProvider>
      </body>
    </html>
  );
}
