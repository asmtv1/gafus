"use client";

import { SWRProvider } from "@gafus/swr";

export function WebSWRProvider({ children }: { children: React.ReactNode }) {
  return <SWRProvider>{children}</SWRProvider>;
}
