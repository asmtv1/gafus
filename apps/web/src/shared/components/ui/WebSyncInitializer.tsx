"use client";

import { useEffect } from "react";

import { initializeOfflineStore } from "@shared/stores/offlineStore";

/** Starts persisted web action recovery without enabling course-download UI or offline navigation. */
export default function WebSyncInitializer() {
  useEffect(() => {
    return initializeOfflineStore();
  }, []);

  return null;
}
