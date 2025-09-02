"use client";

import { QueryProvider } from "@gafus/react-query";

export function WebQueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
