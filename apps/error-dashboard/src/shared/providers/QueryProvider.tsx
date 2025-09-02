"use client";

import { QueryProvider } from "@gafus/react-query";

export function ErrorDashboardQueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
