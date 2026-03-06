"use client";

import { useEffect } from "react";

import { setupGlobalErrorHandling } from "@shared/lib/global-error-handler";

interface TracerLayoutProps {
  children: React.ReactNode;
}

export function TracerLayout({ children }: TracerLayoutProps) {
  useEffect(() => {
    setupGlobalErrorHandling();
  }, []);

  return <>{children}</>;
}
