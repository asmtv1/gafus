"use client";

import { SWRProvider } from "@gafus/swr";

export function TrainerPanelSWRProvider({ children }: { children: React.ReactNode }) {
  return <SWRProvider>{children}</SWRProvider>;
}
