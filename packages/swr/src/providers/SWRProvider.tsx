"use client";

import { SWRConfig } from "swr";

import { defaultSWRConfig } from "../index";

import type { ReactNode } from "react";

interface SWRProviderProps {
  children: ReactNode;
  config?: typeof defaultSWRConfig;
}

export function SWRProvider({ children, config = defaultSWRConfig }: SWRProviderProps) {
  return <SWRConfig value={config}>{children}</SWRConfig>;
}
