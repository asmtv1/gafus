"use client";

import { SWRProvider } from "@gafus/swr";

export function ErrorDashboardSWRProvider({ children }: { children: React.ReactNode }) {
  return <SWRProvider>{children}</SWRProvider>;
}
