// src/app/layout.tsx

import { ErrorBoundary } from "@gafus/error-handling";
import { SITE_CONFIG, DEFAULT_OG_IMAGE, SOCIAL } from "@gafus/metadata";
import PetsProvider from "@shared/components/common/PetsProvider";
import UserProvider from "@shared/components/common/UserProvider";
import ClientLayout from "@shared/components/ui/ClientLayout";
import SessionWrapper from "@shared/components/ui/SessionWrapper";
import { WebQueryProvider } from "@shared/providers/QueryProvider";

import { Montserrat } from "next/font/google";

import type { Metadata, Viewport } from "next";
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

const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-montserrat",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={montserrat.variable}>
      <head>
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
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon180.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon512_rounded.png" />

        {/* DNS prefetch для внешних ресурсов */}
        <link rel="dns-prefetch" href="//res.cloudinary.com" />
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//fonts.gstatic.com" />

        {/* Preconnect для критических доменов */}
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <ErrorBoundary
          config={{
            appName: "gafus",
            environment: process.env.NODE_ENV === "production" ? "production" : "development",
            logToConsole: true, // Показываем ошибки в консоли (ИЗМЕНИТЬ!)
            showErrorDetails: false, // Не показываем детали пользователям
          }}
        >
          <ClientLayout>
            <SessionWrapper>
              <UserProvider>
                <PetsProvider>
                  <WebQueryProvider>
                    <main>{children}</main>

                  </WebQueryProvider>
                </PetsProvider>
              </UserProvider>
            </SessionWrapper>
          </ClientLayout>
        </ErrorBoundary>
      </body>
    </html>
  );
}
