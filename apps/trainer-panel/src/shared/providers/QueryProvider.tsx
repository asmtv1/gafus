"use client";

import { QueryProvider } from "@gafus/react-query";

export function TrainerQueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
